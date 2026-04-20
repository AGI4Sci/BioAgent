#!/usr/bin/env python3
"""BioAgent Python-first structure task.

This file is copied into the active workspace for each structure run. It owns
the scientific work: database search, coordinate download, coordinate parsing,
and artifact JSON assembly. The TypeScript service only launches it and reads
the result JSON.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import re
import sys
import traceback
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


USER_AGENT = "BioAgent/0.1 python-structure-task"


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: structure_task.py <input-json> <output-json>", file=sys.stderr)
        return 2
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    config = json.loads(input_path.read_text(encoding="utf-8"))
    try:
        payload = run(config)
        write_json(output_path, payload)
        return 0
    except Exception as exc:  # noqa: BLE001 - surfaced as failed scientific task
        failure = failure_payload(config, str(exc), traceback.format_exc())
        write_json(output_path, failure)
        print(traceback.format_exc(), file=sys.stderr)
        return 1


def run(config: dict[str, Any]) -> dict[str, Any]:
    prompt = str(config.get("prompt") or "")
    workspace = Path(config["workspacePath"]).resolve()
    run_id = str(config["runId"])
    task_ref = str(config["taskCodeRef"])
    stdout_ref = str(config["stdoutRef"])
    stderr_ref = str(config["stderrRef"])
    output_ref = str(config["outputRef"])
    input_ref = str(config["inputRef"])

    pdb_id = find_pdb_id(prompt)
    accession = find_uniprot_accession(prompt)
    latest_requested = bool(re.search(r"最新|latest|newest|recent|release|released", prompt, re.I))
    residues = residue_ranges(prompt)

    if pdb_id:
        selected = {"source": "RCSB", "pdbId": pdb_id, "searched": None}
    elif accession:
        selected = {"source": "AlphaFold DB", "accession": accession, "searched": None}
    else:
        search = search_rcsb(prompt, latest_requested)
        if not search:
            return no_result_payload(config, prompt, latest_requested)
        selected = {"source": "RCSB", "pdbId": search["pdbId"], "searched": search}

    if selected["source"] == "AlphaFold DB":
        return alphafold_payload(config, accession or "", residues)
    return rcsb_payload(config, str(selected["pdbId"]), selected.get("searched"), residues)


def rcsb_payload(config: dict[str, Any], pdb_id: str, searched: dict[str, Any] | None, residues: list[str]) -> dict[str, Any]:
    workspace = Path(config["workspacePath"]).resolve()
    entry_url = f"https://data.rcsb.org/rest/v1/core/entry/{pdb_id}"
    entry = fetch_json(entry_url)
    coordinate = download_coordinates(pdb_id)
    coordinate_ref = f".bioagent/structures/{pdb_id}.{coordinate['format']}"
    write_text(workspace / coordinate_ref, coordinate["text"])

    info = entry.get("struct") if isinstance(entry.get("struct"), dict) else {}
    exptl_list = entry.get("exptl") if isinstance(entry.get("exptl"), list) else []
    refine_list = entry.get("refine") if isinstance(entry.get("refine"), list) else []
    accession_info = entry.get("rcsb_accession_info") if isinstance(entry.get("rcsb_accession_info"), dict) else {}
    exptl = exptl_list[0] if exptl_list and isinstance(exptl_list[0], dict) else {}
    refine = refine_list[0] if refine_list and isinstance(refine_list[0], dict) else {}
    release_date = string_value(accession_info.get("initial_release_date"))
    latest = bool(searched and searched.get("latest"))
    summary = (
        f"latest released PDB entry {pdb_id}{f' ({release_date[:10]})' if release_date else ''}"
        if latest else f"PDB {pdb_id}"
    )
    task_ref = str(config["taskCodeRef"])

    units = []
    if searched:
        tool = "RCSB.search.latest" if searched.get("latest") else "RCSB.search.text"
        params = {"query": searched.get("query")}
        if searched.get("latest"):
            params.update({"sortBy": "rcsb_accession_info.initial_release_date", "direction": "desc"})
        units.append(execution_unit(config, tool, params, "done", ["RCSB PDB current"], ["structure-summary"]))
    units.append(execution_unit(config, "RCSB.core.entry", {"pdbId": pdb_id, "url": entry_url}, "done", ["RCSB PDB current"], ["structure-summary"]))
    units.append(execution_unit(
        config,
        "RCSB.files.download",
        {"pdbId": pdb_id, "url": coordinate["url"], "outputRef": coordinate_ref, "format": coordinate["format"], "codeRef": task_ref},
        "done",
        ["RCSB PDB current"],
        ["structure-summary"],
    ))

    return {
        "message": f"Python task retrieved RCSB metadata and downloaded coordinates for {summary}.",
        "confidence": 0.86,
        "claimType": "fact",
        "evidenceLevel": "database",
        "reasoningTrace": "\n".join(filter(None, [
            f"Python workspace task searched RCSB with query=\"{searched.get('query')}\"." if searched else "",
            f"Python workspace task queried RCSB core entry API for {pdb_id}.",
            f"Downloaded {coordinate['url']} to {coordinate_ref} and parsed {len(coordinate['atoms'])} preview atoms for the runtime viewer.",
            f"Task code artifact: {task_ref}",
        ])),
        "claims": [{
            "text": f"{summary} metadata and coordinates were retrieved from RCSB; method={string_value(exptl.get('method')) or 'unknown'}.",
            "type": "fact",
            "confidence": 0.86,
            "evidenceLevel": "database",
            "supportingRefs": [f"RCSB:{pdb_id}"],
            "opposingRefs": [],
        }],
        "uiManifest": [
            {"componentId": "molecule-viewer", "title": "Structure", "artifactRef": "structure-summary", "priority": 1},
            {"componentId": "evidence-matrix", "title": "Structure evidence", "artifactRef": "structure-summary", "priority": 2},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "structure-summary", "priority": 3},
        ],
        "executionUnits": units,
        "artifacts": [{
            "id": "structure-summary",
            "type": "structure-summary",
            "producerAgent": "structure",
            "schemaVersion": "1",
            "dataRef": coordinate["url"],
            "metadata": {
                "source": "RCSB",
                "pdbId": pdb_id,
                "releaseDate": release_date,
                "accessedAt": now_iso(),
                "coordinateRef": coordinate_ref,
                "taskCodeRef": task_ref,
                "taskLanguage": "python",
                "taskOutputRef": str(config["outputRef"]),
            },
            "data": {
                "pdbId": pdb_id,
                "ligand": "unknown",
                "title": string_value(info.get("title")),
                "releaseDate": release_date,
                "sourceUrl": coordinate["url"],
                "coordinateRef": coordinate_ref,
                "taskCodeRef": task_ref,
                "coordinateFormat": coordinate["format"],
                "atomCoordinates": coordinate["atoms"],
                "highlightResidues": residues,
                "metrics": {
                    "resolution": number_value(refine.get("ls_d_res_high")),
                    "method": string_value(exptl.get("method")),
                    "pLDDT": None,
                    "mutationRisk": "review-needed" if residues else None,
                },
            },
        }],
    }


def alphafold_payload(config: dict[str, Any], accession: str, residues: list[str]) -> dict[str, Any]:
    workspace = Path(config["workspacePath"]).resolve()
    api_url = f"https://alphafold.ebi.ac.uk/api/prediction/{accession}"
    records = fetch_json(api_url)
    if not isinstance(records, list) or not records:
        raise RuntimeError(f"AlphaFold DB returned no prediction records for UniProt {accession}")
    first = records[0] if isinstance(records[0], dict) else {}
    model_url = string_value(first.get("cifUrl")) or string_value(first.get("pdbUrl"))
    coordinate_ref = None
    coordinate_format = None
    atoms: list[dict[str, Any]] = []
    if model_url:
        text = fetch_text(model_url)
        coordinate_format = "cif" if model_url.lower().endswith(".cif") else "pdb"
        coordinate_ref = f".bioagent/structures/AF-{accession}-F1.{coordinate_format}"
        write_text(workspace / coordinate_ref, text)
        atoms = parse_cif_atoms(text) if coordinate_format == "cif" else parse_pdb_atoms(text)

    unit = execution_unit(config, "AlphaFoldDB.prediction", {"accession": accession, "url": api_url, "modelUrl": model_url}, "done", ["AlphaFold DB current"], ["structure-summary"])
    return {
        "message": f"Python task retrieved AlphaFold DB prediction metadata for UniProt {accession}.",
        "confidence": 0.82,
        "claimType": "fact",
        "evidenceLevel": "database",
        "reasoningTrace": f"Python workspace task queried AlphaFold DB prediction API for {accession} and wrote task code artifact {config['taskCodeRef']}.",
        "claims": [{
            "text": f"UniProt {accession} has an AlphaFold prediction record.",
            "type": "fact",
            "confidence": 0.82,
            "evidenceLevel": "database",
            "supportingRefs": [f"AlphaFold:{accession}"],
            "opposingRefs": [],
        }],
        "uiManifest": [
            {"componentId": "molecule-viewer", "title": "AlphaFold structure", "artifactRef": "structure-summary", "priority": 1},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "structure-summary", "priority": 2},
        ],
        "executionUnits": [unit],
        "artifacts": [{
            "id": "structure-summary",
            "type": "structure-summary",
            "producerAgent": "structure",
            "schemaVersion": "1",
            "dataRef": model_url,
            "metadata": {
                "source": "AlphaFold DB",
                "accession": accession,
                "accessedAt": now_iso(),
                "coordinateRef": coordinate_ref,
                "taskCodeRef": str(config["taskCodeRef"]),
                "taskLanguage": "python",
                "taskOutputRef": str(config["outputRef"]),
            },
            "data": {
                "uniprotId": accession,
                "pdbId": string_value(first.get("entryId")) or f"AF-{accession}-F1",
                "ligand": "none",
                "sourceUrl": model_url,
                "coordinateRef": coordinate_ref,
                "taskCodeRef": str(config["taskCodeRef"]),
                "coordinateFormat": coordinate_format,
                "atomCoordinates": atoms,
                "highlightResidues": residues,
                "metrics": {
                    "pLDDT": number_value(first.get("confidenceAvgLocalDistanceTest")) or number_value(first.get("plddt")),
                    "resolution": None,
                    "method": "AlphaFold prediction",
                },
            },
        }],
    }


def no_result_payload(config: dict[str, Any], prompt: str, latest: bool) -> dict[str, Any]:
    tool = "RCSB.search.latest" if latest else "RCSB.search.text"
    return {
        "message": f"RCSB search returned no structure entries for: {prompt}",
        "confidence": 0.4,
        "claimType": "fact",
        "evidenceLevel": "database",
        "reasoningTrace": "Python workspace task searched RCSB but did not receive a PDB identifier. No demo or default PDB entry was substituted.",
        "claims": [{
            "text": "No PDB entry was selected because RCSB search returned no result for the prompt.",
            "type": "fact",
            "confidence": 0.4,
            "evidenceLevel": "database",
            "supportingRefs": [],
            "opposingRefs": [],
        }],
        "uiManifest": [
            {"componentId": "molecule-viewer", "title": "Structure", "artifactRef": "structure-summary", "priority": 1},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "structure-summary", "priority": 2},
        ],
        "executionUnits": [execution_unit(config, tool, {"prompt": prompt}, "failed", ["RCSB PDB current"], [])],
        "artifacts": [],
    }


def failure_payload(config: dict[str, Any], reason: str, trace: str) -> dict[str, Any]:
    return {
        "message": f"Python structure task failed: {reason}",
        "confidence": 0.2,
        "claimType": "fact",
        "evidenceLevel": "runtime",
        "reasoningTrace": f"Workspace Python task failed and did not substitute demo data.\nstdout={config.get('stdoutRef')}\nstderr={config.get('stderrRef')}\n{trace}",
        "claims": [{
            "text": "Structure task failed before producing a real structure artifact.",
            "type": "fact",
            "confidence": 0.2,
            "evidenceLevel": "runtime",
            "supportingRefs": [],
            "opposingRefs": [],
        }],
        "uiManifest": [
            {"componentId": "molecule-viewer", "title": "Structure", "artifactRef": "structure-summary", "priority": 1},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "structure-summary", "priority": 2},
        ],
        "executionUnits": [execution_unit(config, "bioagent.python.structure_task", {"reason": reason}, "failed", [], [])],
        "artifacts": [],
    }


def search_rcsb(prompt: str, latest: bool) -> dict[str, Any] | None:
    query_text = "latest PDB release" if latest else structure_search_query(prompt)
    query: dict[str, Any] = {
        "query": {
            "type": "terminal",
            "service": "text",
            "parameters": {
                "attribute": "rcsb_accession_info.initial_release_date" if latest else "struct.title",
                "operator": "exists" if latest else "contains_words",
            },
        },
        "return_type": "entry",
        "request_options": {"paginate": {"start": 0, "rows": 1}},
    }
    if not latest:
        query["query"]["parameters"]["value"] = query_text
    if latest:
        query["request_options"]["sort"] = [{"sort_by": "rcsb_accession_info.initial_release_date", "direction": "desc"}]
    result = fetch_json("https://search.rcsb.org/rcsbsearch/v2/query", method="POST", body=query)
    result_set = result.get("result_set") if isinstance(result, dict) else None
    if not isinstance(result_set, list):
        return None
    identifier = next((item.get("identifier") for item in result_set if isinstance(item, dict) and item.get("identifier")), None)
    return {"pdbId": str(identifier).upper(), "query": query_text, "latest": latest} if identifier else None


def download_coordinates(pdb_id: str) -> dict[str, Any]:
    failures = []
    for fmt in ("pdb", "cif"):
        url = f"https://files.rcsb.org/download/{pdb_id}.{fmt}"
        try:
            text = fetch_text(url)
            atoms = parse_pdb_atoms(text) if fmt == "pdb" else parse_cif_atoms(text)
            if not atoms:
                raise RuntimeError(f"No atom coordinates parsed from {fmt}")
            return {"url": url, "format": fmt, "text": text, "atoms": atoms}
        except Exception as exc:  # noqa: BLE001 - collect all download/parser failures
            failures.append(f"{fmt}: {exc}")
    raise RuntimeError("; ".join(failures))


def parse_pdb_atoms(text: str) -> list[dict[str, Any]]:
    atoms = []
    for line in text.splitlines():
        record = line[0:6].strip()
        if record not in {"ATOM", "HETATM"}:
            continue
        try:
            atom_name = line[12:16].strip()
            x = float(line[30:38].strip())
            y = float(line[38:46].strip())
            z = float(line[46:54].strip())
        except ValueError:
            continue
        element = line[76:78].strip() or re.sub(r"\d", "", atom_name)[:2].strip()
        atoms.append({
            "atomName": atom_name,
            "residueName": line[17:20].strip(),
            "chain": line[21:22].strip(),
            "residueNumber": line[22:26].strip(),
            "element": element,
            "x": x,
            "y": y,
            "z": z,
            "hetatm": record == "HETATM",
        })
    return downsample_atoms(atoms)


def parse_cif_atoms(text: str) -> list[dict[str, Any]]:
    lines = text.splitlines()
    atoms = []
    index = 0
    while index < len(lines):
        if lines[index].strip() != "loop_":
            index += 1
            continue
        headers = []
        cursor = index + 1
        while cursor < len(lines) and lines[cursor].strip().startswith("_atom_site."):
            headers.append(lines[cursor].strip())
            cursor += 1
        if not headers:
            index += 1
            continue

        def header_index(name: str) -> int:
            try:
                return headers.index(f"_atom_site.{name}")
            except ValueError:
                return -1

        group_i = header_index("group_PDB")
        x_i = header_index("Cartn_x")
        y_i = header_index("Cartn_y")
        z_i = header_index("Cartn_z")
        if min(group_i, x_i, y_i, z_i) < 0:
            index = cursor
            continue
        while cursor < len(lines):
            line = lines[cursor].strip()
            if not line or line == "#" or line == "loop_" or line.startswith("_"):
                break
            values = cif_tokens(line)
            if len(values) <= max(group_i, x_i, y_i, z_i):
                cursor += 1
                continue
            group = values[group_i]
            if group not in {"ATOM", "HETATM"}:
                cursor += 1
                continue
            try:
                x = float(values[x_i])
                y = float(values[y_i])
                z = float(values[z_i])
            except ValueError:
                cursor += 1
                continue

            def value_for(*names: str) -> str:
                for name in names:
                    pos = header_index(name)
                    if 0 <= pos < len(values) and values[pos] not in {"?", "."}:
                        return values[pos]
                return ""

            atoms.append({
                "atomName": value_for("label_atom_id", "auth_atom_id"),
                "residueName": value_for("label_comp_id", "auth_comp_id"),
                "chain": value_for("auth_asym_id", "label_asym_id"),
                "residueNumber": value_for("auth_seq_id", "label_seq_id"),
                "element": value_for("type_symbol"),
                "x": x,
                "y": y,
                "z": z,
                "hetatm": group == "HETATM",
            })
            cursor += 1
        index = cursor + 1
    return downsample_atoms(atoms)


def cif_tokens(line: str) -> list[str]:
    return [token.strip("'\"") for token in re.findall(r"""'(?:[^']*)'|"(?:[^"]*)"|\S+""", line)]


def downsample_atoms(atoms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    preferred = [atom for atom in atoms if atom.get("atomName") in {"CA", "P", "C4'"} or atom.get("hetatm")]
    source = preferred if len(preferred) >= 24 else atoms
    step = max(1, (len(source) + 219) // 220)
    return source[::step][:220]


def execution_unit(config: dict[str, Any], tool: str, params: dict[str, Any], status: str, db_versions: list[str], artifacts: list[str]) -> dict[str, Any]:
    params_json = json.dumps(params, ensure_ascii=False, sort_keys=True)
    digest = sha1(f"{tool}:{params_json}:{config.get('runId')}")
    return {
        "id": f"EU-{digest[:8]}",
        "tool": tool,
        "params": params_json,
        "status": status,
        "hash": digest[:12],
        "code": f"python {config.get('taskCodeRef')}",
        "language": "python",
        "codeRef": str(config.get("taskCodeRef")),
        "entrypoint": "main",
        "stdoutRef": str(config.get("stdoutRef")),
        "stderrRef": str(config.get("stderrRef")),
        "outputRef": str(config.get("outputRef")),
        "attempt": int(config.get("attempt") or 1),
        "time": "runtime",
        "environment": str(config.get("pythonCommand") or "python3"),
        "inputData": [str(config.get("inputRef")), str(config.get("prompt"))],
        "databaseVersions": db_versions,
        "artifacts": artifacts,
        "outputArtifacts": artifacts,
    }


def find_pdb_id(prompt: str) -> str | None:
    match = re.search(r"\b[0-9][A-Za-z0-9]{3}\b", prompt)
    return match.group(0).upper() if match else None


def find_uniprot_accession(prompt: str) -> str | None:
    match = re.search(r"\b[A-Z][A-Z0-9]{5,9}\b", prompt)
    if match and not find_pdb_id(match.group(0)):
        return match.group(0)
    return None


def structure_search_query(prompt: str) -> str:
    cleaned = re.sub(r"\b(pdb|rcsb|database|db|protein|structure|download|display|show|viewer|3d|latest|newest|recent)\b", " ", prompt, flags=re.I)
    cleaned = re.sub(r"[数据库蛋白质结构下载展示显示最新一下帮我搜索右侧栏]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or "protein structure"


def residue_ranges(prompt: str) -> list[str]:
    return [re.sub(r"\s+", "", match.group(1)) for match in re.finditer(r"\b(\d{1,4}\s*-\s*\d{1,4}|[A-Z]\d{1,4}[A-Z]?)\b", prompt)]


def fetch_json(url: str, method: str = "GET", body: dict[str, Any] | None = None) -> Any:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"User-Agent": USER_AGENT}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def string_value(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def number_value(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def sha1(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()


def now_iso() -> str:
    return _dt.datetime.now(tz=_dt.timezone.utc).isoformat().replace("+00:00", "Z")


if __name__ == "__main__":
    raise SystemExit(main())
