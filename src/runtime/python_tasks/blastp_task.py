#!/usr/bin/env python3
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


DEFAULT_QUERY = "MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKT"
BLAST_URL = "https://blast.ncbi.nlm.nih.gov/Blast.cgi"


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    with open(input_path, "r", encoding="utf-8") as handle:
        task_input = json.load(handle)
    prompt = str(task_input.get("prompt") or "")
    query = protein_query(prompt)
    database = option_value(prompt, "database") or option_value(prompt, "db") or "swissprot"
    hitlist_size = int(option_value(prompt, "hitlist") or option_value(prompt, "maxHits") or option_value(prompt, "max_results") or 5)
    hitlist_size = max(1, min(hitlist_size, 20))
    rid, rtoe = submit_blastp(query, database, hitlist_size)
    xml_text = poll_blast_xml(rid, rtoe)
    rows, alignments, metadata = parse_blast_xml(xml_text)
    payload = {
        "message": f"NCBI BLASTP returned {len(rows)} hits for {metadata.get('queryTitle') or 'protein query'} against {database}.",
        "confidence": 0.88 if rows else 0.55,
        "claimType": "fact",
        "evidenceLevel": "database",
        "reasoningTrace": f"Seed skill sequence.ncbi_blastp_search submitted NCBI BLAST URL API RID={rid}, database={database}, hitlist_size={hitlist_size}.",
        "claims": [
            {
                "text": f"BLASTP hit {row['accession']} ({row['description']}) had e-value {row['evalue']} and {row['percentIdentity']}% identity.",
                "type": "fact",
                "confidence": 0.84,
                "evidenceLevel": "database",
                "supportingRefs": [f"BLAST:{rid}:{row['accession']}"],
                "opposingRefs": [],
            }
            for row in rows[:5]
        ],
        "uiManifest": [
            {"componentId": "data-table", "title": "BLASTP hits", "artifactRef": "sequence-alignment", "priority": 1},
            {"componentId": "unknown-artifact-inspector", "title": "Alignment details", "artifactRef": "sequence-alignment", "priority": 2},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "sequence-alignment", "priority": 3},
        ],
        "executionUnits": [
            execution_unit(
                "sequence.ncbi_blastp_search",
                {
                    "program": "blastp",
                    "database": database,
                    "hitlistSize": hitlist_size,
                    "rid": rid,
                    "queryLength": len(query),
                },
                "done",
                ["NCBI BLAST URL API", metadata.get("version", "BLAST current")],
                ["sequence-alignment"],
            )
        ],
        "artifacts": [
            {
                "id": "sequence-alignment",
                "type": "sequence-alignment",
                "producerScenario": "biomedical-knowledge-graph",
                "schemaVersion": "1",
                "metadata": {
                    "program": "blastp",
                    "database": database,
                    "rid": rid,
                    "queryLength": len(query),
                    "source": "NCBI BLAST",
                    "accessedAt": now(),
                    **metadata,
                },
                "data": {
                    "query": query,
                    "program": "blastp",
                    "database": database,
                    "rid": rid,
                    "rows": rows,
                    "alignments": alignments,
                },
            }
        ],
    }
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def protein_query(prompt):
    fasta_match = re.search(r">[^\n]*\n([A-Za-z*\-\s\n]+)", prompt)
    if fasta_match:
        return clean_sequence(fasta_match.group(1))
    explicit = re.search(r"\b(?:sequence|query|protein)\s*=\s*([A-Za-z*\-\s]+)", prompt, flags=re.I)
    if explicit:
        return clean_sequence(explicit.group(1))
    sequence_like = re.findall(r"\b[A-Z]{20,}\b", prompt)
    if sequence_like:
        return clean_sequence(max(sequence_like, key=len))
    return DEFAULT_QUERY


def clean_sequence(value):
    cleaned = re.sub(r"[^A-Za-z*]", "", value).upper().replace("*", "")
    return cleaned or DEFAULT_QUERY


def option_value(prompt, key):
    match = re.search(rf"\b{re.escape(key)}\s*=\s*([A-Za-z0-9_.-]+)", prompt, flags=re.I)
    return match.group(1) if match else None


def submit_blastp(query, database, hitlist_size):
    params = {
        "CMD": "Put",
        "PROGRAM": "blastp",
        "DATABASE": database,
        "QUERY": query,
        "HITLIST_SIZE": str(hitlist_size),
        "EXPECT": "10",
        "FILTER": "L",
    }
    text = fetch_text(params)
    rid = re.search(r"RID = ([A-Z0-9-]+)", text)
    rtoe = re.search(r"RTOE = (\d+)", text)
    if not rid:
        raise RuntimeError(f"NCBI BLAST did not return a RID: {text[:500]}")
    return rid.group(1), int(rtoe.group(1)) if rtoe else 8


def poll_blast_xml(rid, rtoe):
    deadline = time.time() + 150
    time.sleep(min(max(rtoe, 3), 15))
    while time.time() < deadline:
        text = fetch_text({
            "CMD": "Get",
            "RID": rid,
            "FORMAT_TYPE": "XML",
            "DESCRIPTIONS": "20",
            "ALIGNMENTS": "20",
        })
        if "Status=WAITING" in text:
            time.sleep(5)
            continue
        if "Status=FAILED" in text or "Status=UNKNOWN" in text:
            raise RuntimeError(f"NCBI BLAST run {rid} failed or expired: {text[:300]}")
        if "<BlastOutput" in text:
            return text
        time.sleep(5)
    raise RuntimeError(f"NCBI BLAST run {rid} did not complete before timeout.")


def parse_blast_xml(xml_text):
    root = ET.fromstring(xml_text)
    metadata = {
        "version": text_at(root, "BlastOutput_version"),
        "queryTitle": text_at(root, "BlastOutput_query-def"),
    }
    rows = []
    alignments = []
    for hit in root.findall(".//Hit"):
        hit_num = int(text_at(hit, "Hit_num") or len(rows) + 1)
        accession = text_at(hit, "Hit_accession") or text_at(hit, "Hit_id") or f"hit-{hit_num}"
        description = text_at(hit, "Hit_def") or accession
        hit_len = int(float(text_at(hit, "Hit_len") or 0))
        hsp = hit.find(".//Hsp")
        if hsp is None:
            continue
        align_len = int(float(text_at(hsp, "Hsp_align-len") or 0))
        identity = int(float(text_at(hsp, "Hsp_identity") or 0))
        positives = int(float(text_at(hsp, "Hsp_positive") or 0))
        gaps = int(float(text_at(hsp, "Hsp_gaps") or 0))
        percent_identity = round(identity * 100 / align_len, 2) if align_len else 0
        rows.append({
            "rank": hit_num,
            "accession": accession,
            "description": description[:140],
            "hitLength": hit_len,
            "evalue": text_at(hsp, "Hsp_evalue") or "",
            "bitScore": round(float(text_at(hsp, "Hsp_bit-score") or 0), 2),
            "score": int(float(text_at(hsp, "Hsp_score") or 0)),
            "percentIdentity": percent_identity,
            "identity": identity,
            "positives": positives,
            "gaps": gaps,
            "alignmentLength": align_len,
        })
        alignments.append({
            "rank": hit_num,
            "accession": accession,
            "description": description,
            "queryFrom": int(float(text_at(hsp, "Hsp_query-from") or 0)),
            "queryTo": int(float(text_at(hsp, "Hsp_query-to") or 0)),
            "hitFrom": int(float(text_at(hsp, "Hsp_hit-from") or 0)),
            "hitTo": int(float(text_at(hsp, "Hsp_hit-to") or 0)),
            "qseq": text_at(hsp, "Hsp_qseq"),
            "midline": text_at(hsp, "Hsp_midline"),
            "hseq": text_at(hsp, "Hsp_hseq"),
        })
    return rows, alignments, metadata


def text_at(node, path):
    child = node.find(path)
    return child.text.strip() if child is not None and child.text else ""


def fetch_text(params):
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(f"{BLAST_URL}?{query}", headers={"User-Agent": "BioAgent/0.1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


def execution_unit(skill_id, params, status, database_versions, artifacts):
    digest = hashlib.sha1(json.dumps({"skill": skill_id, "params": params}, sort_keys=True).encode("utf-8")).hexdigest()[:10]
    return {
        "id": f"EU-{skill_id}-{digest}",
        "tool": "NCBI.BLAST.URLAPI.blastp",
        "params": json.dumps(params, ensure_ascii=False),
        "status": status,
        "hash": digest,
        "time": now(),
        "environment": "BioAgent workspace Python task",
        "databaseVersions": database_versions,
        "artifacts": artifacts,
        "outputArtifacts": artifacts,
    }


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


if __name__ == "__main__":
    main()
