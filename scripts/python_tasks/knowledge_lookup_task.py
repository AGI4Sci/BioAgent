#!/usr/bin/env python3
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    with open(input_path, "r", encoding="utf-8") as handle:
        task_input = json.load(handle)
    prompt = str(task_input.get("prompt") or "")
    entity_kind = knowledge_entity_kind(prompt)
    entity = knowledge_entity(prompt, entity_kind)
    if entity_kind == "compound":
        payload = run_chembl_compound(entity, prompt)
    elif entity_kind in ("gene", "protein"):
        payload = run_uniprot(entity)
    else:
        payload = unsupported(entity, entity_kind, prompt)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def run_uniprot(entity):
    query = f"(gene_exact:{entity}) AND (organism_id:9606) AND (reviewed:true)"
    params = urllib.parse.urlencode({"query": query, "format": "json", "size": "1"})
    data = fetch_json(f"https://rest.uniprot.org/uniprotkb/search?{params}")
    record = first_record(data.get("results"))
    accession = str(record.get("primaryAccession") or entity)
    protein = recommended_name(record) or accession
    function_comment = first_function_comment(record) or "review needed"
    found = bool(record.get("primaryAccession"))
    return {
        "message": f"UniProt returned reviewed human entry {accession} for {entity}.",
        "confidence": 0.88 if found else 0.58,
        "claimType": "fact",
        "evidenceLevel": "database",
        "reasoningTrace": "Seed skill knowledge.uniprot_chembl_lookup queried UniProt REST with exact reviewed human gene disambiguation.",
        "claims": [{
            "text": f"{entity} maps to UniProt accession {accession}.",
            "type": "fact",
            "confidence": 0.88 if found else 0.58,
            "evidenceLevel": "database",
            "supportingRefs": [f"UniProt:{accession}"],
            "opposingRefs": [],
        }],
        "uiManifest": knowledge_manifest(),
        "executionUnits": [execution_unit("knowledge", "UniProt.uniprotkb.search", {"query": query, "size": 1}, "done", ["UniProt current"], ["knowledge-graph"])],
        "artifacts": [{
            "id": "knowledge-graph",
            "type": "knowledge-graph",
            "producerAgent": "knowledge",
            "schemaVersion": "1",
            "metadata": {"entity": entity, "accession": accession, "source": "UniProt", "accessedAt": now()},
            "data": {
                "nodes": [
                    {"id": entity, "label": entity, "type": "gene", "confidence": 0.9, "sourceRefs": [f"https://rest.uniprot.org/uniprotkb/{accession}"]},
                    {"id": accession, "label": protein, "type": "protein", "confidence": 0.88, "sourceRefs": [f"https://rest.uniprot.org/uniprotkb/{accession}"]},
                    {"id": "UniProt", "label": "UniProt", "type": "database", "confidence": 0.95, "sourceRefs": ["https://rest.uniprot.org/uniprotkb/search"]},
                ],
                "edges": [
                    {"source": entity, "target": accession, "relation": "encodes", "evidenceLevel": "database", "supportingRefs": [f"UniProt:{accession}"]},
                    {"source": accession, "target": "UniProt", "relation": "sourced_from", "evidenceLevel": "database", "supportingRefs": ["UniProt REST"]},
                ],
                "rows": [
                    {"key": "entity", "value": entity, "source": "prompt"},
                    {"key": "uniprot_accession", "value": accession, "source": "UniProt"},
                    {"key": "protein_name", "value": protein, "source": "UniProt"},
                    {"key": "function", "value": function_comment, "source": "UniProt"},
                ],
            },
        }],
    }


def run_chembl_compound(entity, prompt):
    params = urllib.parse.urlencode({"q": entity})
    data = fetch_json(f"https://www.ebi.ac.uk/chembl/api/data/molecule/search.json?{params}")
    molecules = [item for item in data.get("molecules", []) if isinstance(item, dict)]
    molecule = next((item for item in molecules if str(item.get("pref_name") or "").lower() == entity.lower()), molecules[0] if molecules else None)
    if not molecule:
        return unsupported(entity, "compound", prompt)
    chembl_id = str(molecule.get("molecule_chembl_id") or entity)
    pref_name = str(molecule.get("pref_name") or entity)
    molecule_url = f"https://www.ebi.ac.uk/chembl/explore/compound/{chembl_id}"
    mechanism = first_record(fetch_json(f"https://www.ebi.ac.uk/chembl/api/data/mechanism.json?{urllib.parse.urlencode({'molecule_chembl_id': chembl_id})}").get("mechanisms"))
    indication = first_record(fetch_json(f"https://www.ebi.ac.uk/chembl/api/data/drug_indication.json?{urllib.parse.urlencode({'molecule_chembl_id': chembl_id})}").get("drug_indications"))
    target_id = str(mechanism.get("target_chembl_id") or "")
    target_label = str(mechanism.get("mechanism_of_action") or target_id or "target not reported")
    disease = str(indication.get("efo_term") or indication.get("mesh_heading") or "indication not reported")
    source_refs = [item for item in [molecule_url, first_ref_url(mechanism.get("mechanism_refs")), first_ref_url(indication.get("indication_refs"))] if item]
    nodes = [
        {"id": chembl_id, "label": pref_name, "type": "compound", "confidence": 0.9, "sourceRefs": [molecule_url]},
        {"id": "ChEMBL", "label": "ChEMBL", "type": "database", "confidence": 0.95, "sourceRefs": ["https://www.ebi.ac.uk/chembl/"]},
    ]
    edges = [{"source": chembl_id, "target": "ChEMBL", "relation": "sourced_from", "evidenceLevel": "database", "supportingRefs": [molecule_url]}]
    if target_id:
        nodes.append({"id": target_id, "label": target_label, "type": "target", "confidence": 0.82, "sourceRefs": source_refs})
        edges.append({"source": chembl_id, "target": target_id, "relation": str(mechanism.get("action_type") or "has_mechanism"), "evidenceLevel": "database", "supportingRefs": source_refs})
    if disease != "indication not reported":
        nodes.append({"id": disease, "label": disease, "type": "disease", "confidence": 0.74, "sourceRefs": source_refs})
        edges.append({"source": chembl_id, "target": disease, "relation": "has_indication", "evidenceLevel": "database", "supportingRefs": source_refs})
    return {
        "message": f"ChEMBL returned compound {pref_name} ({chembl_id})" + (f" with target {target_id}." if target_id else "."),
        "confidence": 0.86,
        "claimType": "fact",
        "evidenceLevel": "database",
        "reasoningTrace": f"Seed skill knowledge.uniprot_chembl_lookup queried ChEMBL molecule, mechanism, and indication endpoints for compound entity \"{entity}\".",
        "claims": [{
            "text": f"{pref_name} maps to ChEMBL compound {chembl_id}" + (f" and mechanism target {target_id}." if target_id else "."),
            "type": "fact",
            "confidence": 0.86,
            "evidenceLevel": "database",
            "supportingRefs": [f"ChEMBL:{chembl_id}"] + source_refs,
            "opposingRefs": [],
        }],
        "uiManifest": knowledge_manifest("ChEMBL compound graph", "ChEMBL compound card"),
        "executionUnits": [execution_unit("knowledge", "ChEMBL.molecule.search+mechanism+indication", {"entity": entity, "chemblId": chembl_id}, "done", ["ChEMBL current"], ["knowledge-graph"])],
        "artifacts": [{
            "id": "knowledge-graph",
            "type": "knowledge-graph",
            "producerAgent": "knowledge",
            "schemaVersion": "1",
            "metadata": {"entity": entity, "entityKind": "compound", "chemblId": chembl_id, "source": "ChEMBL", "accessedAt": now(), "sourceRefs": source_refs},
            "data": {
                "nodes": nodes,
                "edges": edges,
                "rows": [
                    {"key": "entity", "value": entity, "source": "prompt"},
                    {"key": "chembl_id", "value": chembl_id, "source": "ChEMBL"},
                    {"key": "pref_name", "value": pref_name, "source": "ChEMBL"},
                    {"key": "max_phase", "value": str(molecule.get("max_phase", "unknown")), "source": "ChEMBL"},
                    {"key": "first_approval", "value": str(molecule.get("first_approval", "unknown")), "source": "ChEMBL"},
                    {"key": "mechanism", "value": target_label, "source": "ChEMBL mechanism"},
                    {"key": "target_chembl_id", "value": target_id or "not reported", "source": "ChEMBL mechanism"},
                    {"key": "indication", "value": disease, "source": "ChEMBL drug_indication"},
                    {"key": "source_url", "value": molecule_url, "source": "ChEMBL"},
                    {"key": "accessedAt", "value": now(), "source": "BioAgent seed skill"},
                ],
            },
        }],
    }


def unsupported(entity, entity_kind, prompt):
    return {
        "message": f"BioAgent knowledge seed skill does not yet support {entity_kind} query \"{entity}\" with a real database connector. No demo drug or trial nodes were generated.",
        "confidence": 1,
        "claimType": "fact",
        "evidenceLevel": "database",
        "reasoningTrace": f"Entity disambiguation classified prompt as {entity_kind}; only UniProt gene/protein lookup and ChEMBL compound lookup are enabled.",
        "claims": [{
            "text": f"{entity_kind} query \"{entity}\" is unsupported until a real {entity_kind} connector is added.",
            "type": "fact",
            "confidence": 1,
            "evidenceLevel": "database",
            "supportingRefs": ["BioAgent.knowledge.unsupported"],
            "opposingRefs": [],
        }],
        "uiManifest": [
            {"componentId": "data-table", "title": "Unsupported knowledge source", "artifactRef": "knowledge-graph", "priority": 1},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "knowledge-graph", "priority": 2},
        ],
        "executionUnits": [execution_unit("knowledge", "BioAgent.knowledge.unsupported", {"entity": entity, "entityKind": entity_kind, "prompt": prompt}, "failed-with-reason", ["BioAgent connector registry"], ["knowledge-graph"], f"No real {entity_kind} connector is configured.")],
        "artifacts": [{
            "id": "knowledge-graph",
            "type": "knowledge-graph",
            "producerAgent": "knowledge",
            "schemaVersion": "1",
            "metadata": {"entity": entity, "entityKind": entity_kind, "source": "unsupported", "accessedAt": now()},
            "data": {"nodes": [], "edges": [], "rows": [
                {"key": "entity", "value": entity, "source": "prompt"},
                {"key": "entity_type", "value": entity_kind, "source": "BioAgent disambiguation"},
                {"key": "status", "value": "unsupported", "source": "BioAgent connector registry"},
                {"key": "accessedAt", "value": now(), "source": "BioAgent seed skill"},
            ]},
        }],
    }


def knowledge_entity(prompt, kind):
    if kind in ("gene", "protein"):
        match = re.search(r"\b[A-Z0-9]{2,12}\b", prompt)
    else:
        match = re.search(r"\b(sotorasib|adagrasib|osimertinib|imatinib|trastuzumab|[A-Za-z][A-Za-z0-9-]{3,})\b", prompt, re.I)
    return match.group(0) if match else "TP53"


def knowledge_entity_kind(prompt):
    normalized = prompt.lower()
    if re.search(r"\b(compound|drug|inhibitor|sotorasib|adagrasib|chembl)\b", normalized):
        return "compound"
    if re.search(r"\b(disease|cancer|tumou?r|carcinoma|opentargets)\b", normalized):
        return "disease"
    if re.search(r"\b(trial|clinicaltrials|nct\d+)\b", normalized):
        return "clinical-trial"
    if re.search(r"\b(protein|uniprot|accession)\b", normalized):
        return "protein"
    return "gene"


def knowledge_manifest(graph_title="Knowledge graph", table_title="Knowledge cards"):
    return [
        {"componentId": "network-graph", "title": graph_title, "artifactRef": "knowledge-graph", "priority": 1},
        {"componentId": "data-table", "title": table_title, "artifactRef": "knowledge-graph", "priority": 2},
        {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "knowledge-graph", "priority": 3},
    ]


def first_record(value):
    return next((item for item in value or [] if isinstance(item, dict)), {})


def recommended_name(record):
    try:
        return record["proteinDescription"]["recommendedName"]["fullName"]["value"]
    except Exception:
        return ""


def first_function_comment(record):
    for comment in record.get("comments", []):
        for text in comment.get("texts", []) if isinstance(comment, dict) else []:
            if isinstance(text, dict) and text.get("value"):
                return str(text.get("value"))
    return ""


def first_ref_url(value):
    for item in value or []:
        if isinstance(item, dict) and item.get("ref_url"):
            return str(item.get("ref_url"))
    return ""


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "BioAgent/0.1"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def execution_unit(agent_id, tool, params, status, database_versions, artifacts, failure_reason=""):
    digest = hashlib.sha1(json.dumps({"tool": tool, "params": params}, sort_keys=True).encode("utf-8")).hexdigest()[:10]
    return {
        "id": f"EU-{agent_id}-{digest}",
        "tool": tool,
        "params": json.dumps(params, ensure_ascii=False),
        "status": status,
        "hash": digest,
        "time": now(),
        "environment": "BioAgent workspace Python task",
        "databaseVersions": database_versions,
        "artifacts": artifacts,
        "outputArtifacts": artifacts,
        "failureReason": failure_reason or None,
    }


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


if __name__ == "__main__":
    main()
