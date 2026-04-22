#!/usr/bin/env python3
import asyncio
import base64
import csv
import io
import json
import os
import re
import statistics
import sys
import time
import urllib.parse
import urllib.request


SCP_KEY_ENV = ("SCP_HUB_API_KEY", "SCPhub_api_key", "SCPHUB_API_KEY")


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    with open(input_path, "r", encoding="utf-8") as handle:
        task_input = json.load(handle)
    prompt = str(task_input.get("prompt") or "")
    skill_id = str(task_input.get("skillId") or "")
    try:
        if is_capability_probe(prompt):
            payload = run_async(run_generic_scp_skill(prompt, skill_id, task_input))
        elif skill_id == "scp.protein-properties-calculation":
            payload = run_async(run_protein_properties(prompt))
        elif skill_id == "scp.tcga-gene-expression":
            payload = run_async(run_tcga_expression(prompt))
        elif skill_id == "scp.molecular-docking":
            payload = run_async(run_molecular_docking(prompt))
        elif skill_id == "scp.drug-screening-docking":
            payload = run_async(run_drug_screening_docking(prompt, task_input))
        elif skill_id == "scp.biomedical-web-search":
            payload = run_async(run_biomedical_search(prompt))
        else:
            payload = run_async(run_generic_scp_skill(prompt, skill_id, task_input))
    except Exception as exc:
        payload = failed_payload(skill_id, prompt, str(exc))
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


async def run_protein_properties(prompt):
    sequence = extract_sequence(prompt) or "MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKT"
    protpara = await mcp_call(
        "https://scp.intern-ai.org.cn/api/v1/mcp/29/SciToolAgent-Bio",
        "ComputeProtPara",
        {"protein": sequence},
    )
    hydrophilicity = await mcp_call(
        "https://scp.intern-ai.org.cn/api/v1/mcp/29/SciToolAgent-Bio",
        "ComputeHydrophilicity",
        {"protein": sequence},
    )
    protpara_text = mcp_text(protpara)
    hydrophilicity_text = mcp_text(hydrophilicity)
    rows = parse_protpara_rows(protpara_text)
    return success_payload(
        skill_id="scp.protein-properties-calculation",
        message=f"SCP SciToolAgent-Bio computed protein properties for a {len(sequence)} aa sequence.",
        artifact_type="protein-properties",
        artifact_id="scp-protein-properties",
        data={
            "sequence": sequence,
            "properties": rows,
            "protparaText": protpara_text,
            "hydrophilicityText": hydrophilicity_text,
            "source": "SCP SciToolAgent-Bio server 29",
        },
        ui=[
            {"componentId": "data-table", "title": "Protein properties", "artifactRef": "scp-protein-properties", "priority": 1},
            {"componentId": "unknown-artifact-inspector", "title": "Raw SCP result", "artifactRef": "scp-protein-properties", "priority": 2},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "scp-protein-properties", "priority": 3},
        ],
        tool="SCP.SciToolAgent-Bio.ComputeProtPara+ComputeHydrophilicity",
        params={"sequenceLength": len(sequence)},
        claims=[f"SCP ComputeProtPara returned {len(rows)} parsed protein-property rows."],
    )


async def run_tcga_expression(prompt):
    gene = option_value(prompt, "gene") or first_gene_symbol(prompt) or "EGFR"
    cancer_type = (option_value(prompt, "cancer_type") or option_value(prompt, "cohort") or "LUAD").upper()
    scp_error = ""
    try:
        scp_result = await mcp_call(
            "https://scp.intern-ai.org.cn/api/v1/mcp/11/Origene-TCGA",
            "get_gene_expression_across_cancers",
            {"gene": gene},
            timeout=25,
        )
        scp_structured = scp_result.get("structuredContent")
        if isinstance(scp_structured, dict) and scp_structured.get("status") == "error":
            scp_error = str(scp_structured.get("error") or "")
        elif not mcp_is_error(scp_result):
            return tcga_payload(gene, cancer_type, [{"source": "SCP Origene-TCGA", "raw": mcp_text(scp_result)}], "SCP Origene-TCGA", scp_error="")
    except Exception as exc:
        scp_error = str(exc)
    rows = fetch_cbioportal_expression(gene, cancer_type)
    return tcga_payload(gene, cancer_type, rows, "cBioPortal TCGA PanCancer Atlas fallback", scp_error=scp_error)


async def run_biomedical_search(prompt):
    query = option_value(prompt, "query") or strip_skill_words(prompt) or "BRCA1 PARP inhibitor resistance"
    pubmed = await mcp_call(
        "https://scp.intern-ai.org.cn/api/v1/mcp/7/Origene-Search",
        "pubmed_search",
        {"query": query},
        timeout=30,
    )
    tavily = None
    try:
        tavily = await mcp_call(
            "https://scp.intern-ai.org.cn/api/v1/mcp/7/Origene-Search",
            "tavily_search",
            {"query": query},
            timeout=30,
        )
    except Exception:
        tavily = None
    rows = [{"source": "pubmed_search", "text": mcp_text(pubmed)[:4000]}]
    if tavily:
        rows.append({"source": "tavily_search", "text": mcp_text(tavily)[:4000]})
    return success_payload(
        skill_id="scp.biomedical-web-search",
        message=f"SCP Origene-Search returned biomedical search results for \"{query}\".",
        artifact_type="paper-list",
        artifact_id="scp-biomedical-search",
        data={"query": query, "rows": rows, "source": "SCP Origene-Search server 7"},
        ui=[
            {"componentId": "paper-card-list", "title": "Biomedical search results", "artifactRef": "scp-biomedical-search", "priority": 1},
            {"componentId": "data-table", "title": "Search result table", "artifactRef": "scp-biomedical-search", "priority": 2},
            {"componentId": "unknown-artifact-inspector", "title": "Raw SCP result", "artifactRef": "scp-biomedical-search", "priority": 3},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "scp-biomedical-search", "priority": 4},
        ],
        tool="SCP.Origene-Search.pubmed_search+tavily_search",
        params={"query": query},
        claims=[f"SCP pubmed_search returned text for query \"{query}\"."],
    )


async def run_molecular_docking(prompt):
    smiles = option_value(prompt, "smiles") or "CC(=O)Oc1ccccc1C(=O)O"
    pdb_file_path = option_value(prompt, "pdb_file_path") or option_value(prompt, "pdbFile")
    center = {
        "pocket_center_x": float(option_value(prompt, "center_x") or 0),
        "pocket_center_y": float(option_value(prompt, "center_y") or 0),
        "pocket_center_z": float(option_value(prompt, "center_z") or 0),
    }
    if pdb_file_path:
        result = await mcp_call(
            "https://scp.intern-ai.org.cn/api/v1/mcp/2/DrugSDA-Tool",
            "molecule_docking_quickvina_fullprocess",
            {"pdb_file_path": pdb_file_path, "smiles": smiles, **center},
            timeout=90,
        )
        structured = result.get("structuredContent")
        if isinstance(structured, dict) and structured.get("status") == "error":
            return docking_failed(smiles, pdb_file_path, str(structured.get("msg") or structured.get("error") or mcp_text(result)))
        return success_payload(
            skill_id="scp.molecular-docking",
            message="SCP DrugSDA QuickVina docking completed.",
            artifact_type="docking-result",
            artifact_id="scp-molecular-docking",
            data={"smiles": smiles, "pdbFilePath": pdb_file_path, "result": structured or mcp_text(result), "source": "SCP DrugSDA-Tool server 2"},
            ui=[
                {"componentId": "data-table", "title": "Docking summary", "artifactRef": "scp-molecular-docking", "priority": 1},
                {"componentId": "unknown-artifact-inspector", "title": "Raw docking result", "artifactRef": "scp-molecular-docking", "priority": 2},
                {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "scp-molecular-docking", "priority": 3},
            ],
            tool="SCP.DrugSDA-Tool.molecule_docking_quickvina_fullprocess",
            params={"smiles": smiles, "pdbFilePath": pdb_file_path, **center},
            claims=["SCP QuickVina docking returned a result object."],
        )
    return docking_failed(
        smiles,
        "",
        "SCP QuickVina requires pdb_file_path pointing to a PDB file path accessible from the SCP DrugSDA server. RCSB URLs and local BioAgent workspace paths are not accepted by the current MCP tool.",
    )


async def run_drug_screening_docking(prompt, task_input=None):
    task_input = task_input or {}
    workspace = str(task_input.get("workspacePath") or os.getcwd())
    run_id = safe_file_token(str(task_input.get("runId") or str(int(time.time()))))
    tool_endpoint = "https://scp.intern-ai.org.cn/api/v1/mcp/2/DrugSDA-Tool"
    pdb_id = (option_value(prompt, "pdb") or first_pdb_id(prompt) or "1A3N").upper()
    smiles_list = extract_smiles_list(prompt) or [
        "CCO",
        "CCN",
        "CC(=O)Oc1ccccc1C(=O)O",
        "N[C@@H](Cc1ccc(O)cc1)C(=O)O",
    ]
    steps = []
    blockers = []

    drug_likeness_result = await mcp_call(
        tool_endpoint,
        "calculate_mol_drug_chemistry",
        {"smiles_list": smiles_list},
        timeout=60,
    )
    drug_likeness = structured_or_text(drug_likeness_result)
    steps.append({"step": "drug-likeness", "tool": "calculate_mol_drug_chemistry", "status": "done", "result": drug_likeness})
    metrics = drug_likeness.get("metrics") if isinstance(drug_likeness, dict) else []
    passed = [
        row.get("smiles")
        for row in metrics
        if isinstance(row, dict) and int(row.get("lipinski_rule_of_5_violations") or 0) == 0 and row.get("smiles")
    ]
    if not passed:
        passed = smiles_list

    admet_result = await mcp_call(
        tool_endpoint,
        "pred_mol_admet",
        {"smiles_list": passed, "smiles_file": ""},
        timeout=120,
    )
    admet = structured_or_text(admet_result)
    if mcp_is_error(admet_result) or (isinstance(admet, dict) and str(admet.get("status")).lower() == "error"):
        blockers.append({"step": "admet", "reason": mcp_text(admet_result)})
        admet_rows = []
        steps.append({"step": "admet", "tool": "pred_mol_admet", "status": "failed-with-reason", "result": admet})
    else:
        admet_rows = admet.get("json_content") if isinstance(admet, dict) and isinstance(admet.get("json_content"), list) else []
        steps.append({"step": "admet", "tool": "pred_mol_admet", "status": "done", "result": admet})

    ranked_admet = sorted(
        [row for row in admet_rows if isinstance(row, dict)],
        key=lambda row: admet_rank_score(row),
        reverse=True,
    )
    admet_top = ranked_admet[: min(100, len(ranked_admet))]
    docking_inputs = [row.get("smiles") for row in admet_top if row.get("smiles")] or passed

    pdb_server_path = ""
    pdb_upload_result = None
    try:
        pdb_text = fetch_text_url(f"https://files.rcsb.org/download/{pdb_id}.pdb")
        pdb_upload_result = await mcp_call(
            tool_endpoint,
            "base64_to_server_file",
            {
                "file_name": f"{pdb_id}.pdb",
                "file_base64_string": base64.b64encode(pdb_text.encode("utf-8")).decode("ascii"),
            },
            timeout=60,
        )
        pdb_server_path = extract_path(structured_or_text(pdb_upload_result))
        if not pdb_server_path:
            blockers.append({"step": "pdb-staging", "reason": f"base64_to_server_file did not return a server file path: {mcp_text(pdb_upload_result)[:500]}"})
            steps.append({"step": "pdb-staging", "tool": "base64_to_server_file", "status": "failed-with-reason", "result": structured_or_text(pdb_upload_result)})
        else:
            steps.append({"step": "pdb-staging", "tool": "base64_to_server_file", "status": "done", "result": {"pdbId": pdb_id, "pdbFilePath": pdb_server_path}})
    except Exception as exc:
        blockers.append({"step": "pdb-staging", "reason": str(exc)})
        steps.append({"step": "pdb-staging", "tool": "RCSB.files.download+base64_to_server_file", "status": "failed-with-reason", "result": str(exc)})

    pocket = {}
    if pdb_server_path:
        try:
            pocket_result = await mcp_call(tool_endpoint, "pred_pocket_prank", {"pdb_file_path": pdb_server_path}, timeout=120)
            pocket_data = structured_or_text(pocket_result)
            pockets = pocket_data.get("pred_pockets") if isinstance(pocket_data, dict) else []
            pocket = pockets[0] if isinstance(pockets, list) and pockets and isinstance(pockets[0], dict) else {}
            steps.append({"step": "pocket", "tool": "pred_pocket_prank", "status": "done" if pocket else "failed-with-reason", "result": pocket_data})
            if not pocket:
                blockers.append({"step": "pocket", "reason": f"pred_pocket_prank did not return a usable pocket: {mcp_text(pocket_result)[:500]}"})
        except Exception as exc:
            blockers.append({"step": "pocket", "reason": str(exc)})
            steps.append({"step": "pocket", "tool": "pred_pocket_prank", "status": "failed-with-reason", "result": str(exc)})

    docking_results = []
    if pdb_server_path and pocket:
        center = {
            "pocket_center_x": float(pocket.get("center_x") or option_value(prompt, "center_x") or 0),
            "pocket_center_y": float(pocket.get("center_y") or option_value(prompt, "center_y") or 0),
            "pocket_center_z": float(pocket.get("center_z") or option_value(prompt, "center_z") or 0),
        }
        for smiles in docking_inputs[: min(5, len(docking_inputs))]:
            try:
                docking_result = await mcp_call(
                    tool_endpoint,
                    "molecule_docking_quickvina_fullprocess",
                    {"pdb_file_path": pdb_server_path, "smiles": smiles, **center},
                    timeout=180,
                )
                docking_data = structured_or_text(docking_result)
                status = "failed-with-reason" if mcp_is_error(docking_result) or mcp_structured_error(docking_result) else "done"
                docking_results.append({"smiles": smiles, "status": status, "result": docking_data})
            except Exception as exc:
                docking_results.append({"smiles": smiles, "status": "failed-with-reason", "reason": str(exc)})
        if any(item.get("status") == "done" for item in docking_results):
            steps.append({"step": "docking", "tool": "molecule_docking_quickvina_fullprocess", "status": "done", "result": docking_results})
        else:
            blockers.append({"step": "docking", "reason": "All docking attempts failed with the current SCP tool."})
            steps.append({"step": "docking", "tool": "molecule_docking_quickvina_fullprocess", "status": "failed-with-reason", "result": docking_results})

    similarity = {}
    if docking_inputs:
        try:
            target = docking_inputs[0]
            similarity_result = await mcp_call(
                tool_endpoint,
                "calculate_morgan_fingerprint_similarity",
                {"target_smiles": target, "candidate_smiles_list": smiles_list, "radius": 2, "nBits": 2048},
                timeout=60,
            )
            similarity = structured_or_text(similarity_result)
            steps.append({"step": "similarity-expansion", "tool": "calculate_morgan_fingerprint_similarity", "status": "done", "result": similarity})
        except Exception as exc:
            blockers.append({"step": "similarity-expansion", "reason": str(exc)})
            steps.append({"step": "similarity-expansion", "tool": "calculate_morgan_fingerprint_similarity", "status": "failed-with-reason", "result": str(exc)})

    docking_top = ranked_docking_rows(docking_results, top_n=1000)
    similarity_rows = similarity_table_rows(similarity)
    csv_exports = materialize_workflow_csvs(
        workspace,
        run_id,
        prescreen_rows=[row for row in metrics if isinstance(row, dict)],
        docking_rows=docking_top,
        admet_rows=admet_top,
        similarity_rows=similarity_rows,
    )

    overall_status = "failed-with-reason" if blockers and not (metrics or admet_top or similarity) else "partial" if blockers else "done"
    artifact_id = "virtual-screening-workflow"
    message = "SCP DrugSDA virtual-screening workflow completed" if overall_status == "done" else "SCP DrugSDA virtual-screening workflow returned partial results with explicit blockers"
    return {
        "message": f"{message}: {len(passed)} Lipinski-pass molecules, {len(admet_top)} ADMET rows, {len(docking_results)} docking attempts.",
        "confidence": 0.8 if overall_status != "failed-with-reason" else 1,
        "claimType": "fact",
        "evidenceLevel": "runtime",
        "reasoningTrace": "Ran a BioAgent workflow adapter over existing SCP DrugSDA MCP tools. Partial failures are retained as blockers, not substituted with fake scores.",
        "claims": [{
            "text": f"Virtual-screening workflow status: {overall_status}.",
            "type": "fact",
            "confidence": 0.8 if overall_status != "failed-with-reason" else 1,
            "evidenceLevel": "runtime",
            "supportingRefs": ["SCP DrugSDA-Tool"],
            "opposingRefs": [],
        }],
        "uiManifest": [
            {"componentId": "data-table", "title": "Virtual screening summary", "artifactRef": artifact_id, "priority": 1},
            {"componentId": "unknown-artifact-inspector", "title": "Workflow details", "artifactRef": artifact_id, "priority": 2},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": artifact_id, "priority": 3},
        ],
        "executionUnits": [execution_unit(
            "scp.drug-screening-docking",
            "SCP.DrugSDA.virtual_screening_workflow",
            {"pdbId": pdb_id, "smilesCount": len(smiles_list), "status": overall_status, "blockers": blockers},
            "failed-with-reason" if overall_status == "failed-with-reason" else "done",
            ["SCP DrugSDA-Tool server 2", "RCSB PDB current"],
            [artifact_id],
        )],
        "artifacts": [{
            "id": artifact_id,
            "type": "virtual-screening-workflow",
            "producerScenario": "scp-live-skill-adapter",
            "schemaVersion": "1",
            "metadata": {"skillId": "scp.drug-screening-docking", "source": "SCP DrugSDA-Tool server 2", "accessedAt": now(), "status": overall_status},
            "data": {
                "status": overall_status,
                "rows": docking_top or flatten_rows(admet_top) or [row for row in metrics if isinstance(row, dict)],
                "pdbId": pdb_id,
                "pdbFilePath": pdb_server_path,
                "inputSmiles": smiles_list,
                "lipinskiPassSmiles": passed,
                "admetTop": admet_top,
                "dockingResults": docking_results,
                "dockingTop1000": docking_top,
                "similarityExpansion": similarity,
                "similarityExpansionRows": similarity_rows,
                "steps": steps,
                "blockers": blockers,
                "downloads": csv_exports,
                "downloadRefs": {item["key"]: item["path"] for item in csv_exports},
                "downloadNote": "CSV files are materialized in the workspace and embedded in this artifact for browser download. With the provided representative SMILES list, docking_top1000.csv contains all available ranked docking rows, not 1000 unique molecules.",
            },
        }],
    }


async def run_generic_scp_skill(prompt, skill_id, task_input):
    markdown_ref = str(task_input.get("skillMarkdownRef") or "")
    description = str(task_input.get("skillDescription") or "")
    text = ""
    if markdown_ref and os.path.exists(markdown_ref):
        with open(markdown_ref, "r", encoding="utf-8") as handle:
            text = handle.read()
    endpoints = unique(re.findall(r"https://scp\.intern-ai\.org\.cn/api/v1/mcp/\d+/[A-Za-z0-9_.-]+", text))
    declared_tools = unique(re.findall(r"call_tool\(\s*[\"']([^\"']+)[\"']", text))
    declared_tools += [tool for tool in re.findall(r"\*\*`([^`]+)`\*\*", text) if tool not in declared_tools]
    endpoints = unique(endpoints + inferred_endpoints(skill_id, f"{description}\n{text}"))
    if not endpoints:
        return generic_capability_payload(
            skill_id,
            prompt,
            status="failed-with-reason",
            reason="This SCP Markdown skill does not declare a direct MCP endpoint, and no endpoint could be inferred from its id or description.",
            endpoints=[],
            servers=[],
            selected=None,
        )

    servers = []
    for endpoint in endpoints[:6]:
        try:
            tools = await mcp_list_tools(endpoint, timeout=20)
            available = [item["name"] for item in tools]
            declared_available = [tool for tool in declared_tools if tool in available]
            servers.append({
                "endpoint": endpoint,
                "status": "available",
                "toolCount": len(available),
                "declaredTools": declared_tools,
                "declaredAvailable": declared_available,
                "sampleTools": available[:40],
                "schemas": {item["name"]: item.get("inputSchema") for item in tools[:80]},
            })
        except Exception as exc:
            servers.append({
                "endpoint": endpoint,
                "status": "failed",
                "reason": str(exc)[:1000],
                "declaredTools": declared_tools,
            })

    available_servers = [server for server in servers if server.get("status") == "available"]
    if not available_servers:
        return generic_capability_payload(
            skill_id,
            prompt,
            status="failed-with-reason",
            reason="No declared or inferred SCP MCP endpoint was reachable.",
            endpoints=endpoints,
            servers=servers,
            selected=None,
        )

    selected = select_tool(skill_id, prompt, declared_tools, available_servers)
    capability_probe = bool(re.search(r"\b(capability_probe|probe_only|discover_only)\s*=\s*true\b", prompt, flags=re.I))
    if capability_probe or not selected:
        return generic_capability_payload(
            skill_id,
            prompt,
            status="done",
            reason="SCP skill endpoints are reachable and tools were discovered. Provide task inputs or tool=<name> to execute a specific MCP tool.",
            endpoints=endpoints,
            servers=servers,
            selected=selected,
        )

    args, missing = build_arguments(prompt, selected.get("schema") or {})
    if missing:
        return generic_capability_payload(
            skill_id,
            prompt,
            status="failed-with-reason",
            reason=f"Selected tool {selected['tool']} is available but required inputs are missing: {', '.join(missing)}.",
            endpoints=endpoints,
            servers=servers,
            selected={**selected, "arguments": args, "missing": missing},
        )
    try:
        result = await mcp_call(selected["endpoint"], selected["tool"], args, timeout=60)
        if mcp_is_error(result) or mcp_structured_error(result):
            return generic_capability_payload(
                skill_id,
                prompt,
                status="failed-with-reason",
                reason=f"Selected tool {selected['tool']} returned an MCP error: {mcp_text(result)[:1000]}",
                endpoints=endpoints,
                servers=servers,
                selected={**selected, "arguments": args},
            )
        return success_payload(
            skill_id=skill_id,
            message=f"SCP live adapter executed {selected['tool']} for {skill_id}.",
            artifact_type="scp-live-result",
            artifact_id="scp-live-result",
            data={
                "skillId": skill_id,
                "endpoint": selected["endpoint"],
                "tool": selected["tool"],
                "arguments": args,
                "result": result,
                "servers": servers,
            },
            ui=[
                {"componentId": "data-table", "title": "SCP live result", "artifactRef": "scp-live-result", "priority": 1},
                {"componentId": "unknown-artifact-inspector", "title": "Raw SCP result", "artifactRef": "scp-live-result", "priority": 2},
                {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "scp-live-result", "priority": 3},
            ],
            tool=f"SCP.generic.{selected['tool']}",
            params={"endpoint": selected["endpoint"], "tool": selected["tool"], "arguments": args},
            claims=[f"SCP MCP tool {selected['tool']} executed through {selected['endpoint']}."],
        )
    except Exception as exc:
        return generic_capability_payload(
            skill_id,
            prompt,
            status="failed-with-reason",
            reason=f"Selected tool {selected['tool']} failed: {str(exc)[:1000]}",
            endpoints=endpoints,
            servers=servers,
            selected={**selected, "arguments": args},
        )


async def mcp_list_tools(url, timeout=30):
    api_key = scp_api_key()
    if not api_key:
        raise RuntimeError("SCP_HUB_API_KEY or SCPhub_api_key is required for live SCP MCP calls.")
    from mcp.client.streamable_http import streamablehttp_client
    from mcp import ClientSession
    async with streamablehttp_client(url, headers={"SCP-HUB-API-KEY": api_key}, timeout=timeout, sse_read_timeout=timeout) as (read, write, _get_session_id):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            out = []
            for tool in tools.tools:
                dumped = tool.model_dump() if hasattr(tool, "model_dump") else {}
                out.append({
                    "name": getattr(tool, "name", dumped.get("name", "")),
                    "description": getattr(tool, "description", dumped.get("description", "")),
                    "inputSchema": dumped.get("inputSchema") or dumped.get("input_schema") or getattr(tool, "inputSchema", {}),
                })
            return out


async def mcp_call(url, tool_name, arguments, timeout=45):
    api_key = scp_api_key()
    if not api_key:
        raise RuntimeError("SCP_HUB_API_KEY or SCPhub_api_key is required for live SCP MCP calls.")
    from mcp.client.streamable_http import streamablehttp_client
    from mcp import ClientSession
    async with streamablehttp_client(url, headers={"SCP-HUB-API-KEY": api_key}, timeout=timeout, sse_read_timeout=timeout) as (read, write, _get_session_id):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool_name, arguments=arguments)
            return result.model_dump()


def fetch_cbioportal_expression(gene, cancer_type):
    study = f"{cancer_type.lower()}_tcga_pan_can_atlas_2018"
    base = "https://www.cbioportal.org/api"
    gene_record = fetch_json(f"{base}/genes/{urllib.parse.quote(gene)}")
    entrez = gene_record.get("entrezGeneId")
    if not entrez:
        raise RuntimeError(f"cBioPortal did not resolve gene {gene}.")
    sample_list = fetch_json(f"{base}/sample-lists/{study}_all")
    sample_ids = (sample_list.get("sampleIds") or [])[:80]
    profile = f"{study}_rna_seq_v2_mrna"
    body = json.dumps({"entrezGeneIds": [entrez], "sampleIds": sample_ids}).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/molecular-profiles/{profile}/molecular-data/fetch?projection=DETAILED",
        method="POST",
        headers={"Accept": "application/json", "Content-Type": "application/json", "User-Agent": "BioAgent/0.1"},
        data=body,
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        rows = json.loads(response.read().decode("utf-8"))
    return [{
        "sampleId": row.get("sampleId"),
        "patientId": row.get("patientId"),
        "studyId": row.get("studyId"),
        "gene": gene,
        "value": row.get("value"),
    } for row in rows if isinstance(row, dict)]


def tcga_payload(gene, cancer_type, rows, source, scp_error=""):
    numeric = [float(row["value"]) for row in rows if isinstance(row, dict) and isinstance(row.get("value"), (int, float))]
    summary = {
        "n": len(numeric),
        "mean": round(statistics.mean(numeric), 4) if numeric else None,
        "median": round(statistics.median(numeric), 4) if numeric else None,
        "min": round(min(numeric), 4) if numeric else None,
        "max": round(max(numeric), 4) if numeric else None,
    }
    return success_payload(
        skill_id="scp.tcga-gene-expression",
        message=f"TCGA expression query returned {len(rows)} rows for {gene} in {cancer_type}.",
        artifact_type="tcga-expression",
        artifact_id="scp-tcga-expression",
        data={"gene": gene, "cancerType": cancer_type, "summary": summary, "rows": rows, "source": source, "scpError": scp_error},
        ui=[
            {"componentId": "data-table", "title": "TCGA expression table", "artifactRef": "scp-tcga-expression", "priority": 1},
            {"componentId": "unknown-artifact-inspector", "title": "Expression summary", "artifactRef": "scp-tcga-expression", "priority": 2},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "scp-tcga-expression", "priority": 3},
        ],
        tool="SCP.Origene-TCGA.get_gene_expression_across_cancers + cBioPortal fallback",
        params={"gene": gene, "cancerType": cancer_type, "source": source},
        claims=[f"{source} returned {len(rows)} expression rows for {gene}."],
    )


def success_payload(skill_id, message, artifact_type, artifact_id, data, ui, tool, params, claims):
    return {
        "message": message,
        "confidence": 0.82,
        "claimType": "fact",
        "evidenceLevel": "database",
        "reasoningTrace": f"Live SCP adapter executed {skill_id} via {tool}.",
        "claims": [{
            "text": claim,
            "type": "fact",
            "confidence": 0.82,
            "evidenceLevel": "database",
            "supportingRefs": [tool],
            "opposingRefs": [],
        } for claim in claims],
        "uiManifest": ui,
        "executionUnits": [execution_unit(skill_id, tool, params, "done", [tool], [artifact_id])],
        "artifacts": [{
            "id": artifact_id,
            "type": artifact_type,
            "producerScenario": "scp-live-skill-adapter",
            "schemaVersion": "1",
            "metadata": {"skillId": skill_id, "source": tool, "accessedAt": now()},
            "data": data,
        }],
    }


def docking_failed(smiles, pdb_file_path, reason):
    payload = failed_payload("scp.molecular-docking", f"smiles={smiles} pdb_file_path={pdb_file_path}", reason)
    payload["artifacts"] = [{
        "id": "scp-molecular-docking",
        "type": "docking-result",
        "producerScenario": "scp-live-skill-adapter",
        "schemaVersion": "1",
        "metadata": {"skillId": "scp.molecular-docking", "source": "SCP DrugSDA-Tool server 2", "accessedAt": now()},
        "data": {"smiles": smiles, "pdbFilePath": pdb_file_path, "status": "failed-with-reason", "reason": reason},
    }]
    payload["uiManifest"] = [
        {"componentId": "data-table", "title": "Docking blocker", "artifactRef": "scp-molecular-docking", "priority": 1},
        {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "scp-molecular-docking", "priority": 2},
    ]
    payload["executionUnits"][0]["artifacts"] = ["scp-molecular-docking"]
    payload["executionUnits"][0]["outputArtifacts"] = ["scp-molecular-docking"]
    return payload


def failed_payload(skill_id, prompt, reason):
    return {
        "message": f"Live SCP skill adapter could not complete {skill_id}: {reason}",
        "confidence": 1,
        "claimType": "fact",
        "evidenceLevel": "runtime",
        "reasoningTrace": f"{skill_id} failed with explicit reason. No fake artifact was substituted.",
        "claims": [{
            "text": reason,
            "type": "fact",
            "confidence": 1,
            "evidenceLevel": "runtime",
            "supportingRefs": [skill_id],
            "opposingRefs": [],
        }],
        "uiManifest": [{"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "scp-live-skill-result", "priority": 1}],
        "executionUnits": [execution_unit(skill_id, "SCP.live-adapter", {"prompt": prompt, "reason": reason}, "failed-with-reason", ["BioAgent SCP adapter"], [])],
        "artifacts": [],
    }


def generic_capability_payload(skill_id, prompt, status, reason, endpoints, servers, selected):
    artifact_id = "scp-skill-capability"
    return {
        "message": f"SCP skill capability check for {skill_id}: {reason}",
        "confidence": 0.78 if status == "done" else 1,
        "claimType": "fact",
        "evidenceLevel": "runtime",
        "reasoningTrace": f"Generic SCP adapter inspected {len(endpoints)} endpoint(s) for {skill_id}.",
        "claims": [{
            "text": reason,
            "type": "fact",
            "confidence": 0.78 if status == "done" else 1,
            "evidenceLevel": "runtime",
            "supportingRefs": endpoints,
            "opposingRefs": [],
        }],
        "uiManifest": [
            {"componentId": "data-table", "title": "SCP skill capability", "artifactRef": artifact_id, "priority": 1},
            {"componentId": "unknown-artifact-inspector", "title": "SCP endpoint details", "artifactRef": artifact_id, "priority": 2},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": artifact_id, "priority": 3},
        ],
        "executionUnits": [execution_unit(
            skill_id,
            "SCP.generic-live-adapter",
            {"prompt": prompt, "endpoints": endpoints, "selected": selected},
            status,
            endpoints or ["SCP skill markdown"],
            [artifact_id],
        )],
        "artifacts": [{
            "id": artifact_id,
            "type": "scp-skill-capability",
            "producerScenario": "scp-live-skill-adapter",
            "schemaVersion": "1",
            "metadata": {"skillId": skill_id, "accessedAt": now(), "status": status},
            "data": {
                "skillId": skill_id,
                "status": status,
                "reason": reason,
                "endpoints": endpoints,
                "servers": servers,
                "selected": selected,
            },
        }],
    }


def execution_unit(skill_id, tool, params, status, database_versions, artifacts):
    return {
        "id": f"EU-{skill_id}-{abs(hash(json.dumps(params, sort_keys=True))) % 1000000}",
        "tool": tool,
        "skillId": skill_id,
        "params": json.dumps(params, ensure_ascii=False),
        "status": status,
        "hash": str(abs(hash((skill_id, tool, json.dumps(params, sort_keys=True)))) % 100000000),
        "time": now(),
        "environment": "BioAgent workspace Python task + SCP MCP",
        "databaseVersions": database_versions,
        "artifacts": artifacts,
        "outputArtifacts": artifacts,
    }


def mcp_text(result):
    content = result.get("content") if isinstance(result, dict) else None
    if isinstance(content, list):
        return "\n".join(str(item.get("text") or "") for item in content if isinstance(item, dict))
    structured = result.get("structuredContent") if isinstance(result, dict) else None
    return json.dumps(structured, ensure_ascii=False) if structured is not None else str(result)


def structured_or_text(result):
    structured = result.get("structuredContent") if isinstance(result, dict) else None
    if structured is not None:
        return structured
    text = mcp_text(result)
    try:
        return json.loads(text)
    except Exception:
        return text


def select_tool(skill_id, prompt, declared_tools, servers):
    requested = option_value(prompt, "tool")
    tokens = set(re.split(r"[^a-z0-9]+", f"{skill_id} {prompt}".lower()))
    candidates = []
    for server in servers:
        endpoint = server["endpoint"]
        schemas = server.get("schemas") or {}
        names = list((schemas or {}).keys()) or server.get("sampleTools") or []
        for name in names:
            score = 0
            if requested and (requested == name or tool_alias_matches(requested, name)):
                score += 100
            if name in declared_tools:
                score += 25
            name_tokens = set(re.split(r"[^a-z0-9]+", name.lower()))
            score += len(tokens.intersection(name_tokens))
            candidates.append({
                "endpoint": endpoint,
                "tool": name,
                "schema": schemas.get(name) or {},
                "score": score,
            })
    candidates.sort(key=lambda item: item["score"], reverse=True)
    return candidates[0] if candidates and candidates[0]["score"] > 0 else None


def tool_alias_matches(requested, name):
    aliases = {
        "calculate_smiles_similarity": {"calculate_morgan_fingerprint_similarity"},
    }
    return name in aliases.get(str(requested), set())


def build_arguments(prompt, schema):
    properties = schema.get("properties") if isinstance(schema, dict) else {}
    required = schema.get("required") if isinstance(schema, dict) else []
    if not isinstance(properties, dict):
        properties = {}
    if not isinstance(required, list):
        required = []
    args = {}
    missing = []
    for name in required:
        value = prompt_value_for_field(prompt, str(name), properties.get(name) if isinstance(properties.get(name), dict) else {})
        if value is None:
            missing.append(str(name))
        else:
            args[str(name)] = value
    for name, prop in properties.items():
        if name in args:
            continue
        value = prompt_value_for_field(prompt, str(name), prop if isinstance(prop, dict) else {})
        if value is not None:
            args[str(name)] = value
    return args, missing


def prompt_value_for_field(prompt, name, prop):
    explicit = option_value(prompt, name)
    if explicit is not None:
        return coerce_value(explicit, prop)
    lower = name.lower()
    if "file" in lower or "path" in lower:
        return option_value(prompt, name) or ""
    if "smiles" in lower:
        return option_value(prompt, "smiles") or "CCO"
    if lower in ("sequence", "protein") or "protein" in lower:
        return extract_sequence(prompt) or "MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKT"
    if "query" in lower:
        return option_value(prompt, "query") or strip_skill_words(prompt) or "BRCA1 PARP inhibitor resistance"
    if "gene" in lower or "symbol" in lower:
        return option_value(prompt, "gene") or first_gene_symbol(prompt) or "TP53"
    if "drug" in lower:
        return option_value(prompt, "drug") or "aspirin"
    if "molecule_name" in lower or lower == "name" or "compound" in lower:
        return option_value(prompt, name) or option_value(prompt, "compound") or "aspirin"
    if "pdb" in lower:
        return option_value(prompt, name) or option_value(prompt, "pdb") or "1A3N"
    if "taxon" in lower:
        return option_value(prompt, name) or "9606"
    if prop.get("type") == "number":
        return 0
    if prop.get("type") == "integer":
        return 1
    if prop.get("type") == "boolean":
        return True
    return None


def coerce_value(value, prop):
    typ = prop.get("type") if isinstance(prop, dict) else None
    if typ == "array":
        if isinstance(value, list):
            return value
        items = prop.get("items") if isinstance(prop.get("items"), dict) else {}
        return [
            coerce_value(item.strip(), items)
            for item in re.split(r"[|;,\n]+", str(value))
            if item.strip()
        ]
    if typ == "number":
        try:
            return float(value)
        except Exception:
            return 0
    if typ == "integer":
        try:
            return int(float(value))
        except Exception:
            return 1
    if typ == "boolean":
        return str(value).lower() in ("1", "true", "yes", "y")
    return value


def mcp_is_error(result):
    return bool(isinstance(result, dict) and result.get("isError"))


def mcp_structured_error(result):
    structured = result.get("structuredContent") if isinstance(result, dict) else None
    if isinstance(structured, dict):
        status = str(structured.get("status") or "").lower()
        return status in ("error", "failed", "failure")
    return False


def parse_protpara_rows(text):
    rows = []
    for label in ["Number of amino acids", "Theoretical pI", "Molecular weight", "Instability index", "Aliphatic index", "Grand average of hydropathicity"]:
        match = re.search(rf"{re.escape(label)}:?\s*([^\n]+)", text, flags=re.I)
        if match:
            rows.append({"property": label, "value": match.group(1).strip()})
    return rows


def extract_sequence(prompt):
    explicit = re.search(r"\b(?:sequence|protein)\s*=\s*([A-Za-z*\-\s]+)", prompt, flags=re.I)
    if explicit:
        return re.sub(r"[^A-Za-z]", "", explicit.group(1)).upper()
    hits = re.findall(r"\b[A-Z]{20,}\b", prompt)
    return max(hits, key=len) if hits else ""


def extract_smiles_list(prompt):
    value = option_value(prompt, "smiles_list")
    if not value:
        value = option_value(prompt, "smiles")
    if not value:
        return []
    return [item.strip() for item in re.split(r"[|;\n]+", value) if item.strip()]


def first_pdb_id(prompt):
    explicit = re.search(r"\bPDB\s+([0-9][A-Za-z0-9]{3})\b", prompt, flags=re.I)
    if explicit:
        return explicit.group(1)
    match = re.search(r"\b([0-9][A-Za-z0-9]{3})\b", prompt)
    return match.group(1) if match else ""


def fetch_text_url(url):
    req = urllib.request.Request(url, headers={"Accept": "text/plain,*/*", "User-Agent": "BioAgent/0.1"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read().decode("utf-8")


def extract_path(value):
    if isinstance(value, str):
        return value if "/" in value else ""
    if isinstance(value, dict):
        for key in ("file_path", "filePath", "path", "output_file", "server_file_path", "pdb_file_path"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
        for candidate in value.values():
            found = extract_path(candidate)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = extract_path(item)
            if found:
                return found
    return ""


def admet_rank_score(row):
    preds = row.get("admet_predictions") if isinstance(row, dict) and isinstance(row.get("admet_predictions"), dict) else {}
    druglikeness = row.get("druglikeness") if isinstance(row, dict) and isinstance(row.get("druglikeness"), dict) else {}
    score = 0.0
    score += float(preds.get("QED") or 0)
    score += 0.2 if druglikeness.get("lipinski_pass") else 0
    score += 0.1 if druglikeness.get("veber_pass") else 0
    score -= float(preds.get("AMES") or 0) * 0.2
    score -= float(preds.get("hERG") or 0) * 0.2
    return score


def ranked_docking_rows(docking_results, top_n=1000):
    rows = []
    for item in docking_results:
        if not isinstance(item, dict):
            continue
        result = item.get("result") if isinstance(item.get("result"), (dict, list, str)) else {}
        score = extract_docking_score(result)
        rows.append({
            "smiles": item.get("smiles", ""),
            "rank": "",
            "score": score if score is not None else "",
            "status": item.get("status", ""),
            "tool": "molecule_docking_quickvina_fullprocess",
            "score_source": "SCP DrugSDA QuickVina" if score is not None else "score not parsed from SCP response",
            "result_summary": compact_json(result, 600) if result else str(item.get("reason", ""))[:600],
        })
    rows = sorted(rows, key=lambda row: float(row["score"]) if row["score"] != "" else float("inf"))
    for index, row in enumerate(rows[:top_n], start=1):
        row["rank"] = index
    return rows[:top_n]


def extract_docking_score(value):
    if isinstance(value, dict):
        for key in ("score", "docking_score", "binding_affinity", "affinity", "min_score", "vina_score", "best_score"):
            parsed = parse_float(value.get(key))
            if parsed is not None:
                return parsed
        for key, candidate in value.items():
            if re.search(r"(score|affinity|vina|energy)", str(key), flags=re.I):
                parsed = parse_float(candidate)
                if parsed is not None:
                    return parsed
        for candidate in value.values():
            parsed = extract_docking_score(candidate)
            if parsed is not None:
                return parsed
    if isinstance(value, list):
        scores = [extract_docking_score(item) for item in value]
        scores = [score for score in scores if score is not None]
        return min(scores) if scores else None
    if isinstance(value, str):
        match = re.search(r"(?:score|affinity|energy)[^0-9+\-.]{0,30}([+-]?\d+(?:\.\d+)?)", value, flags=re.I)
        if match:
            return parse_float(match.group(1))
    return None


def similarity_table_rows(similarity):
    if isinstance(similarity, dict):
        for key in ("similarities", "results", "scores", "rows", "data"):
            value = similarity.get(key)
            if isinstance(value, list):
                return [normalize_similarity_row(item) for item in value]
        if similarity.get("candidate_smiles") or similarity.get("candidate"):
            return [normalize_similarity_row(similarity)]
    if isinstance(similarity, list):
        return [normalize_similarity_row(item) for item in similarity]
    return []


def normalize_similarity_row(item):
    if isinstance(item, dict):
        return {
            "candidate_smiles": item.get("candidate_smiles") or item.get("smiles") or item.get("candidate") or "",
            "similarity": item.get("similarity") or item.get("score") or item.get("tanimoto") or "",
            "source": "calculate_morgan_fingerprint_similarity",
            "raw": compact_json(item, 500),
        }
    return {"candidate_smiles": str(item), "similarity": "", "source": "calculate_morgan_fingerprint_similarity", "raw": str(item)}


def materialize_workflow_csvs(workspace, run_id, prescreen_rows, docking_rows, admet_rows, similarity_rows):
    base_dir = os.path.join(workspace, ".bioagent", "virtual-screening", run_id)
    os.makedirs(base_dir, exist_ok=True)
    exports = []
    specs = [
        ("prescreenCsv", "prescreen.csv", prescreen_rows),
        ("dockingTop1000Csv", "docking_top1000.csv", docking_rows),
        ("admetTop100Csv", "admet_top100.csv", flatten_rows(admet_rows)),
        ("similarityExpansionCsv", "similarity_expansion.csv", similarity_rows),
    ]
    for key, filename, rows in specs:
        csv_text = rows_to_csv(rows)
        path = os.path.join(base_dir, filename)
        with open(path, "w", encoding="utf-8", newline="") as handle:
            handle.write(csv_text)
        exports.append({
            "key": key,
            "name": filename,
            "path": os.path.relpath(path, workspace),
            "contentType": "text/csv",
            "rowCount": len(rows),
            "content": csv_text,
        })
    return exports


def rows_to_csv(rows):
    normalized = flatten_rows(rows)
    output = io.StringIO()
    if not normalized:
        output.write("status\n")
        output.write("empty\n")
        return output.getvalue()
    columns = []
    for row in normalized:
        for key in row.keys():
            if key not in columns:
                columns.append(key)
    writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for row in normalized:
        writer.writerow(row)
    return output.getvalue()


def flatten_rows(rows):
    out = []
    for row in rows or []:
        if isinstance(row, dict):
            flat = {}
            for key, value in row.items():
                flat[key] = compact_json(value, 800) if isinstance(value, (dict, list)) else value
            out.append(flat)
    return out


def compact_json(value, limit):
    try:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    except Exception:
        text = str(value)
    return text if len(text) <= limit else f"{text[:limit - 3]}..."


def parse_float(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        match = re.search(r"[+-]?\d+(?:\.\d+)?", value)
        if match:
            return float(match.group(0))
    return None


def safe_file_token(value):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")[:80] or "run"


def option_value(prompt, key):
    quoted = re.search(rf"\b{re.escape(key)}\s*=\s*([\"'])(.*?)\1", prompt, flags=re.I)
    if quoted:
        return quoted.group(2).strip()
    match = re.search(rf"\b{re.escape(key)}\s*=\s*([A-Za-z0-9_./:+=%~,-]+)", prompt, flags=re.I)
    return match.group(1).rstrip("。；;,") if match else None


def first_gene_symbol(prompt):
    match = re.search(r"\b[A-Z0-9]{2,12}\b", prompt)
    return match.group(0) if match else ""


def strip_skill_words(prompt):
    return re.sub(r"\b(?:biomedical|web|search|pubmed|scp|skill|use)\b", " ", prompt, flags=re.I).strip()


def is_capability_probe(prompt):
    return bool(re.search(r"\b(capability_probe|probe_only|discover_only)\s*=\s*true\b", prompt, flags=re.I))


def fetch_json(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "BioAgent/0.1"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def scp_api_key():
    for name in SCP_KEY_ENV:
        value = os.environ.get(name)
        if value:
            return value
    return ""


def unique(values):
    out = []
    for value in values:
        if value and value not in out:
            out.append(value)
    return out


def inferred_endpoints(skill_id, text):
    lower = f"{skill_id} {text}".lower()
    candidates = []
    rules = [
        (("drugsda", "docking", "admet", "smiles", "molecular", "compound", "fingerprint"), "https://scp.intern-ai.org.cn/api/v1/mcp/2/DrugSDA-Tool"),
        (("chem", "molecule", "descriptor", "functional", "peptide"), "https://scp.intern-ai.org.cn/api/v1/mcp/31/SciToolAgent-Chem"),
        (("protein", "peptide", "bio", "sequence", "sequencing"), "https://scp.intern-ai.org.cn/api/v1/mcp/29/SciToolAgent-Bio"),
        (("blast", "biomarker", "cell_line", "pharmacogenomics"), "https://scp.intern-ai.org.cn/api/v1/mcp/17/BioInfo-Tools"),
        (("pubmed", "literature", "search", "web"), "https://scp.intern-ai.org.cn/api/v1/mcp/7/Origene-Search"),
        (("tcga", "expression"), "https://scp.intern-ai.org.cn/api/v1/mcp/11/Origene-TCGA"),
        (("uniprot",), "https://scp.intern-ai.org.cn/api/v1/mcp/10/Origene-UniProt"),
        (("chembl",), "https://scp.intern-ai.org.cn/api/v1/mcp/4/Origene-ChEMBL"),
        (("pubchem",), "https://scp.intern-ai.org.cn/api/v1/mcp/8/Origene-PubChem"),
        (("kegg", "pathway"), "https://scp.intern-ai.org.cn/api/v1/mcp/5/Origene-KEGG"),
        (("ncbi", "gene", "genome", "virus"), "https://scp.intern-ai.org.cn/api/v1/mcp/9/Origene-NCBI"),
        (("ensembl", "variant", "ortholog", "gwas"), "https://scp.intern-ai.org.cn/api/v1/mcp/12/Origene-Ensembl"),
        (("fda", "drug_safety", "warning", "pharmacokinetic", "pediatric", "pharmacology"), "https://scp.intern-ai.org.cn/api/v1/mcp/14/Origene-FDADrug"),
        (("opentarget", "disease"), "https://scp.intern-ai.org.cn/api/v1/mcp/15/Origene-OpenTargets"),
        (("cancer", "therapy", "oncology"), "https://scp.intern-ai.org.cn/api/v1/mcp/17/BioInfo-Tools"),
        (("cancer", "therapy", "oncology"), "https://scp.intern-ai.org.cn/api/v1/mcp/11/Origene-TCGA"),
        (("variant", "functional", "pathogenicity"), "https://scp.intern-ai.org.cn/api/v1/mcp/12/Origene-Ensembl"),
        (("systems", "pharmacology"), "https://scp.intern-ai.org.cn/api/v1/mcp/15/Origene-OpenTargets"),
    ]
    for tokens, endpoint in rules:
        if any(token in lower for token in tokens):
            candidates.append(endpoint)
    return unique(candidates)[:4]


def run_async(coro):
    return asyncio.run(coro)


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


if __name__ == "__main__":
    main()
