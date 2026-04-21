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
    query = literature_query(prompt)
    retmax = 5
    ids = pubmed_search(query, retmax)
    papers = pubmed_summaries(ids)
    payload = {
        "message": f"PubMed returned {len(papers)} paper records for: {query}" if papers else f"PubMed returned no paper records for: {query}",
        "confidence": 0.86 if papers else 0.55,
        "claimType": "fact" if papers else "inference",
        "evidenceLevel": "database",
        "reasoningTrace": f"Seed skill literature.pubmed_search queried PubMed E-utilities with retmax={retmax}.",
        "claims": [
            {
                "text": f"{paper['title']} ({paper.get('year', '')}) was retrieved from PubMed for {query}.",
                "type": "fact",
                "confidence": 0.84,
                "evidenceLevel": "database",
                "supportingRefs": [f"PMID:{paper['pmid']}"],
                "opposingRefs": [],
            }
            for paper in papers
        ],
        "uiManifest": [
            {"componentId": "paper-card-list", "title": "PubMed papers", "artifactRef": "paper-list", "priority": 1},
            {"componentId": "evidence-matrix", "title": "Evidence", "artifactRef": "paper-list", "priority": 2},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "paper-list", "priority": 3},
        ],
        "executionUnits": [
            execution_unit(
                "literature",
                "PubMed.eutils.esearch+esummary",
                {"query": query, "retmax": retmax, "database": "pubmed"},
                "done",
                ["PubMed E-utilities"],
                ["paper-list"],
            )
        ],
        "artifacts": [
            {
                "id": "paper-list",
                "type": "paper-list",
                "producerAgent": "literature",
                "schemaVersion": "1",
                "metadata": {"query": query, "retmax": retmax, "source": "PubMed", "accessedAt": now()},
                "data": {"query": query, "papers": papers},
            }
        ],
    }
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def literature_query(prompt):
    text = re.sub(r"返回.*$", "", prompt)
    text = re.sub(r"请|文献|证据|近三年|三年|paper-list|JSON|artifact|claims|ExecutionUnit", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:180] or "KRAS G12D pancreatic cancer targeted therapy"


def pubmed_search(query, retmax):
    params = urllib.parse.urlencode({"db": "pubmed", "term": query, "retmode": "json", "retmax": str(retmax)})
    data = fetch_json(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?{params}")
    return [str(item) for item in data.get("esearchresult", {}).get("idlist", []) if item]


def pubmed_summaries(ids):
    if not ids:
        return []
    params = urllib.parse.urlencode({"db": "pubmed", "id": ",".join(ids), "retmode": "json"})
    data = fetch_json(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?{params}")
    result = data.get("result", {})
    papers = []
    for pmid in ids:
        record = result.get(pmid, {})
        authors = [item.get("name", "") for item in record.get("authors", []) if isinstance(item, dict) and item.get("name")]
        pubdate = str(record.get("pubdate") or "")
        year_match = re.search(r"\d{4}", pubdate)
        title = str(record.get("title") or f"PMID {pmid}")
        papers.append({
            "pmid": pmid,
            "title": title,
            "authors": authors,
            "journal": str(record.get("fulljournalname") or record.get("source") or "PubMed"),
            "year": year_match.group(0) if year_match else "",
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            "abstract": str(record.get("sorttitle") or title),
            "evidenceLevel": "database",
        })
    return papers


def fetch_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "BioAgent/0.1"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def execution_unit(agent_id, tool, params, status, database_versions, artifacts):
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
    }


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


if __name__ == "__main__":
    main()

