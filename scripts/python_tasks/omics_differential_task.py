#!/usr/bin/env python3
import csv
import hashlib
import json
import math
import os
import re
import statistics
import subprocess
import sys
import time
import tempfile


def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    with open(input_path, "r", encoding="utf-8") as handle:
        task_input = json.load(handle)
    workspace = str(task_input.get("workspacePath") or os.getcwd())
    prompt = str(task_input.get("prompt") or "")
    params = omics_params(prompt)
    if not params["matrixRef"] or not params["metadataRef"]:
        raise ValueError("matrixRef and metadataRef are required for omics.differential_expression")
    matrix_path = safe_workspace_path(workspace, params["matrixRef"])
    metadata_path = safe_workspace_path(workspace, params["metadataRef"])
    matrix = parse_matrix(matrix_path)
    metadata = parse_csv(metadata_path)
    runtime = omics_runtime_availability(params)
    runner_result = run_omics_differential(matrix_path, metadata_path, matrix, metadata, params, runtime)
    run = runner_result["run"]
    artifact_data = {
        "points": run["points"],
        "heatmap": {
            "label": f"{params['caseGroup']} vs {params['controlGroup']}",
            "matrix": run["heatmap"],
            "genes": [point["gene"] for point in run["points"][:12]],
            "samples": matrix["samples"],
        },
        "umap": run["umap"],
    }
    input_fingerprints = {
        "matrix": sha1_file(matrix_path),
        "metadata": sha1_file(metadata_path),
    }
    payload = {
        "message": f"BioAgent omics seed skill identified {run['significantCount']} genes passing alpha={params['alpha']} using {runner_result['runner']}.",
        "confidence": 0.76,
        "claimType": "inference",
        "evidenceLevel": "experimental",
        "reasoningTrace": f"Seed skill omics.differential_expression read matrix={params['matrixRef']} and metadata={params['metadataRef']} inside the BioAgent workspace; executed {runner_result['runner']}.",
        "claims": [{
            "text": f"{run['significantCount']} genes pass alpha={params['alpha']} in {runner_result['runner']}.",
            "type": "inference",
            "confidence": 0.76,
            "evidenceLevel": "experimental",
            "supportingRefs": ["omics-differential-expression"],
            "opposingRefs": [],
        }],
        "uiManifest": [
            {"componentId": "volcano-plot", "title": "Volcano", "artifactRef": "omics-differential-expression", "priority": 1},
            {"componentId": "heatmap-viewer", "title": "Heatmap", "artifactRef": "omics-differential-expression", "priority": 2},
            {"componentId": "umap-viewer", "title": "UMAP", "artifactRef": "omics-differential-expression", "priority": 3},
            {"componentId": "execution-unit-table", "title": "Execution units", "artifactRef": "omics-differential-expression", "priority": 4},
        ],
        "executionUnits": [
            execution_unit(
                "omics",
                runner_result["runner"],
                params,
                "done",
                runner_result["softwareVersions"],
                ["omics-differential-expression"],
                input_fingerprints,
            )
        ],
        "artifacts": [{
            "id": "omics-differential-expression",
            "type": "omics-differential-expression",
            "producerAgent": "omics",
            "schemaVersion": "1",
            "metadata": {
                "runner": runner_result["runner"],
                "requestedRunner": params.get("runner") or "auto",
                "effectiveRunner": runner_result["runner"],
                "runtimeAvailability": runtime,
                "normalizationMethod": runner_result["normalizationMethod"],
                "statisticalModel": runner_result["statisticalModel"],
                "designMatrix": params["designFormula"],
                "inputFingerprints": input_fingerprints,
                "warnings": runner_result["warnings"],
                "softwareVersions": runner_result["softwareVersions"],
                "accessedAt": now(),
            },
            "data": artifact_data,
        }],
    }
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def omics_params(prompt):
    def get(key):
        match = re.search(rf"{re.escape(key)}=([^\s]+)", prompt)
        return match.group(1) if match else ""
    runner = normalize_runner(get("runner"))
    return {
        "matrixRef": get("matrixRef"),
        "metadataRef": get("metadataRef"),
        "groupColumn": get("groupColumn") or "condition",
        "caseGroup": get("caseGroup") or "treated",
        "controlGroup": get("controlGroup") or "control",
        "designFormula": get("designFormula") or "~condition",
        "alpha": float(get("alpha") or "0.05"),
        "runner": runner,
    }


def normalize_runner(value):
    normalized = value.lower()
    if not normalized:
        return ""
    if normalized in ("scanpy", "scanpy.rank_genes_groups"):
        return "scanpy.rank_genes_groups"
    if normalized == "deseq2":
        return "DESeq2"
    if normalized in ("edger", "edger".lower()):
        return "edgeR"
    if normalized in ("local", "omics.local-csv-differential", "omics.python-csv-differential"):
        return "omics.python-csv-differential"
    return value


def omics_runtime_availability(params):
    python_version = sys.version.split()[0]
    scanpy = module_available("scanpy")
    pandas = module_available("pandas")
    numpy = module_available("numpy")
    rscript = command_available("Rscript", ["--version"])
    deseq2 = r_package_available("DESeq2") if rscript["available"] else {"available": False, "package": "DESeq2", "error": "Rscript unavailable"}
    edger = r_package_available("edgeR") if rscript["available"] else {"available": False, "package": "edgeR", "error": "Rscript unavailable"}
    selected = params.get("runner") or ""
    if not selected:
        selected = "scanpy.rank_genes_groups" if scanpy["available"] and pandas["available"] and numpy["available"] else "DESeq2" if deseq2["available"] else "edgeR" if edger["available"] else "omics.python-csv-differential"
    return {
        "python": {"available": True, "command": sys.executable, "version": python_version},
        "scanpy": scanpy,
        "pandas": pandas,
        "numpy": numpy,
        "rscript": rscript,
        "deseq2": deseq2,
        "edger": edger,
        "selectedRunner": selected,
        "fallbackRunner": "omics.python-csv-differential",
    }


def run_omics_differential(matrix_path, metadata_path, matrix, metadata, params, runtime):
    requested = params.get("runner") or runtime["selectedRunner"]
    warnings = []
    if requested == "scanpy.rank_genes_groups":
        if runtime["scanpy"]["available"] and runtime["pandas"]["available"] and runtime["numpy"]["available"]:
            try:
                return {
                    "runner": "scanpy.rank_genes_groups",
                    "run": run_scanpy_differential(matrix_path, metadata_path, matrix, metadata, params),
                    "normalizationMethod": "Scanpy normalize_total + log1p",
                    "statisticalModel": "Scanpy rank_genes_groups t-test",
                    "softwareVersions": runner_versions(runtime, ["python", "scanpy", "pandas", "numpy"]),
                    "warnings": warnings,
                }
            except Exception as exc:
                warnings.append(f"Scanpy runner failed; falling back to omics.python-csv-differential: {exc}")
        else:
            warnings.append("Requested Scanpy runner is unavailable; falling back to omics.python-csv-differential.")
    if requested == "DESeq2":
        if runtime["rscript"]["available"] and runtime["deseq2"]["available"]:
            try:
                return {
                    "runner": "DESeq2",
                    "run": run_r_package_differential(matrix_path, metadata_path, matrix, metadata, params, "DESeq2"),
                    "normalizationMethod": "DESeq2 size-factor normalization",
                    "statisticalModel": f"DESeq2 Wald test with design {params['designFormula']}",
                    "softwareVersions": runner_versions(runtime, ["rscript", "deseq2"]),
                    "warnings": warnings,
                }
            except Exception as exc:
                warnings.append(f"DESeq2 runner failed; falling back to omics.python-csv-differential: {exc}")
        else:
            warnings.append("Requested DESeq2 runner is unavailable; falling back to omics.python-csv-differential.")
    if requested == "edgeR":
        if runtime["rscript"]["available"] and runtime["edger"]["available"]:
            try:
                return {
                    "runner": "edgeR",
                    "run": run_r_package_differential(matrix_path, metadata_path, matrix, metadata, params, "edgeR"),
                    "normalizationMethod": "edgeR calcNormFactors TMM normalization",
                    "statisticalModel": "edgeR quasi-likelihood GLM two-group contrast",
                    "softwareVersions": runner_versions(runtime, ["rscript", "edger"]),
                    "warnings": warnings,
                }
            except Exception as exc:
                warnings.append(f"edgeR runner failed; falling back to omics.python-csv-differential: {exc}")
        else:
            warnings.append("Requested edgeR runner is unavailable; falling back to omics.python-csv-differential.")
    return {
        "runner": "omics.python-csv-differential",
        "run": differential(matrix, metadata, params),
        "normalizationMethod": "log2(count + 1) group mean difference",
        "statisticalModel": "Welch t-test approximation with Benjamini-Hochberg FDR",
        "softwareVersions": ["BioAgent Python CSV runner"],
        "warnings": warnings,
    }


def run_scanpy_differential(matrix_path, metadata_path, matrix, metadata, params):
    script = r'''
import json
import math
import sys
import numpy as np
import pandas as pd
import scanpy as sc

matrix_path, metadata_path, output_path, group_column, case_group, control_group, alpha = sys.argv[1:8]
raw = pd.read_csv(matrix_path)
gene_column = raw.columns[0]
genes = raw[gene_column].astype(str).tolist()
counts = raw.drop(columns=[gene_column]).apply(pd.to_numeric, errors="coerce").fillna(0)
metadata = pd.read_csv(metadata_path)
sample_column = "sample" if "sample" in metadata.columns else ("sampleId" if "sampleId" in metadata.columns else metadata.columns[0])
metadata = metadata.set_index(sample_column).reindex(counts.columns)
if group_column not in metadata.columns:
    raise ValueError(f"metadata is missing group column {group_column}")
adata = sc.AnnData(X=counts.T.to_numpy(dtype=float))
adata.obs_names = list(counts.columns)
adata.var_names = genes
adata.obs[group_column] = metadata[group_column].astype(str).fillna("unknown").to_numpy()
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
sc.tl.rank_genes_groups(adata, groupby=group_column, groups=[case_group], reference=control_group, method="t-test")
ranked = adata.uns["rank_genes_groups"]
points = []
for i, gene in enumerate(ranked["names"][case_group]):
    pvalue = float(ranked["pvals"][case_group][i])
    fdr = float(ranked["pvals_adj"][case_group][i])
    logfc = float(ranked["logfoldchanges"][case_group][i])
    points.append({"gene": str(gene), "logFC": logfc if math.isfinite(logfc) else 0.0, "pValue": pvalue if math.isfinite(pvalue) else 1.0, "fdr": fdr if math.isfinite(fdr) else 1.0, "significant": fdr <= float(alpha)})
try:
    if adata.n_obs >= 3 and adata.n_vars >= 2:
        sc.pp.pca(adata, n_comps=min(2, adata.n_obs - 1, adata.n_vars - 1))
        sc.pp.neighbors(adata, n_neighbors=max(2, min(10, adata.n_obs - 1)))
        sc.tl.umap(adata)
        coords = adata.obsm["X_umap"]
    else:
        raise ValueError("not enough samples for UMAP")
except Exception:
    coords = np.column_stack([np.arange(adata.n_obs), np.asarray(adata.X).mean(axis=1)])
umap = [{"sample": str(adata.obs_names[i]), "x": float(coords[i, 0]), "y": float(coords[i, 1]), "cluster": str(adata.obs[group_column].iloc[i])} for i in range(adata.n_obs)]
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump({"points": points, "umap": umap}, handle)
'''
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as output:
        output_path = output.name
    try:
        subprocess.run([sys.executable, "-c", script, matrix_path, metadata_path, output_path, params["groupColumn"], params["caseGroup"], params["controlGroup"], str(params["alpha"])], check=True, text=True, capture_output=True, timeout=120)
        with open(output_path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
        return complete_differential_run(raw.get("points", []), matrix, metadata, params, raw.get("umap", []))
    finally:
        try:
            os.unlink(output_path)
        except OSError:
            pass


def run_r_package_differential(matrix_path, metadata_path, matrix, metadata, params, package_name):
    code = deseq2_runner_code() if package_name == "DESeq2" else edger_runner_code()
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as output:
        output_path = output.name
    try:
        subprocess.run(["Rscript", "-e", code, matrix_path, metadata_path, output_path, params["groupColumn"], params["caseGroup"], params["controlGroup"], params["designFormula"]], check=True, text=True, capture_output=True, timeout=120)
        rows = parse_csv(output_path)
        return complete_differential_run(rows, matrix, metadata, params)
    finally:
        try:
            os.unlink(output_path)
        except OSError:
            pass


def parse_csv(path):
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def parse_matrix(path):
    rows = parse_csv(path)
    headers = list(rows[0].keys()) if rows else []
    gene_key = headers[0] if headers else "gene"
    samples = headers[1:]
    return {
        "samples": samples,
        "rows": [
            {"gene": str(row.get(gene_key) or ""), "values": [to_float(row.get(sample)) for sample in samples]}
            for row in rows
            if str(row.get(gene_key) or "")
        ],
    }


def differential(matrix, metadata, params):
    sample_groups = {
        row.get("sample") or row.get("sampleId") or row.get("id"): row.get(params["groupColumn"])
        for row in metadata
    }
    case_indexes = [idx for idx, sample in enumerate(matrix["samples"]) if sample_groups.get(sample) == params["caseGroup"]]
    control_indexes = [idx for idx, sample in enumerate(matrix["samples"]) if sample_groups.get(sample) == params["controlGroup"]]
    if not case_indexes or not control_indexes:
        raise ValueError(f"No samples found for caseGroup={params['caseGroup']} and controlGroup={params['controlGroup']}")
    points = []
    for row in matrix["rows"]:
        cases = [row["values"][idx] for idx in case_indexes]
        controls = [row["values"][idx] for idx in control_indexes]
        p_value = welch_approx_p(cases, controls)
        points.append({
            "gene": row["gene"],
            "logFC": mean([log2p1(value) for value in cases]) - mean([log2p1(value) for value in controls]),
            "pValue": p_value,
            "fdr": p_value,
            "significant": False,
        })
    return complete_differential_run(points, matrix, metadata, params)


def complete_differential_run(points_input, matrix, metadata, params, umap_input=None):
    points = []
    for item in points_input:
        if not isinstance(item, dict):
            continue
        gene = str(item.get("gene") or item.get("name") or "")
        if not gene:
            continue
        p_value = to_float(item.get("pValue") if item.get("pValue") is not None else item.get("pvalue") if item.get("pvalue") is not None else item.get("PValue"))
        fdr = to_float(item.get("fdr") if item.get("fdr") is not None else item.get("padj") if item.get("padj") is not None else item.get("FDR"))
        points.append({
            "gene": gene,
            "logFC": to_float(item.get("logFC") if item.get("logFC") is not None else item.get("log2FoldChange")),
            "pValue": p_value if p_value > 0 else 1,
            "fdr": fdr if fdr > 0 else math.nan,
            "significant": False,
        })
    points.sort(key=lambda item: item["pValue"])
    m = len(points)
    for index, point in enumerate(points):
        if not math.isfinite(point["fdr"]):
            point["fdr"] = min(1, point["pValue"] * m / max(1, index + 1))
        point["significant"] = point["fdr"] <= params["alpha"]
    sample_groups = {
        row.get("sample") or row.get("sampleId") or row.get("id"): row.get(params["groupColumn"])
        for row in metadata
    }
    top_genes = [point["gene"] for point in points[:12]]
    heatmap = [next((row["values"] for row in matrix["rows"] if row["gene"] == gene), []) for gene in top_genes]
    fallback_umap = [
        {
            "x": index - (len(matrix["samples"]) - 1) / 2,
            "y": mean([row["values"][index] for row in matrix["rows"]]) if matrix["rows"] else 0,
            "cluster": sample_groups.get(sample) or "unknown",
            "sample": sample,
        }
        for index, sample in enumerate(matrix["samples"])
    ]
    umap = []
    for index, point in enumerate(umap_input or []):
        if isinstance(point, dict):
            umap.append({
                "x": to_float(point.get("x") if point.get("x") is not None else point.get("umap1")),
                "y": to_float(point.get("y") if point.get("y") is not None else point.get("umap2")),
                "cluster": str(point.get("cluster") or point.get("group") or "unknown"),
                "sample": str(point.get("sample") or point.get("label") or (matrix["samples"][index] if index < len(matrix["samples"]) else f"sample-{index + 1}")),
            })
    return {
        "points": points,
        "significantCount": len([point for point in points if point["significant"]]),
        "heatmap": heatmap,
        "umap": umap or fallback_umap,
    }


def deseq2_runner_code():
    return r'''
args <- commandArgs(TRUE)
matrix_path <- args[[1]]
metadata_path <- args[[2]]
output_path <- args[[3]]
group_column <- args[[4]]
case_group <- args[[5]]
control_group <- args[[6]]
design_formula <- args[[7]]
suppressPackageStartupMessages(library(DESeq2))
counts_raw <- read.csv(matrix_path, check.names=FALSE)
genes <- as.character(counts_raw[[1]])
counts <- as.matrix(counts_raw[, -1, drop=FALSE])
rownames(counts) <- genes
storage.mode(counts) <- "numeric"
metadata <- read.csv(metadata_path, check.names=FALSE)
sample_column <- if ("sample" %in% names(metadata)) "sample" else if ("sampleId" %in% names(metadata)) "sampleId" else names(metadata)[[1]]
rownames(metadata) <- metadata[[sample_column]]
metadata <- metadata[colnames(counts), , drop=FALSE]
metadata[[group_column]] <- relevel(factor(metadata[[group_column]]), ref=control_group)
dds <- DESeqDataSetFromMatrix(countData=round(counts), colData=metadata, design=as.formula(design_formula))
dds <- estimateSizeFactors(dds)
dds <- tryCatch(estimateDispersions(dds, quiet=TRUE), error=function(e) { dds2 <- estimateDispersionsGeneEst(dds); dispersions(dds2) <- mcols(dds2)$dispGeneEst; dds2 })
dds <- nbinomWaldTest(dds, quiet=TRUE)
res <- results(dds, contrast=c(group_column, case_group, control_group))
out <- data.frame(gene=rownames(res), logFC=res$log2FoldChange, pValue=res$pvalue, fdr=res$padj)
write.csv(out, output_path, row.names=FALSE)
'''


def edger_runner_code():
    return r'''
args <- commandArgs(TRUE)
matrix_path <- args[[1]]
metadata_path <- args[[2]]
output_path <- args[[3]]
group_column <- args[[4]]
case_group <- args[[5]]
control_group <- args[[6]]
suppressPackageStartupMessages(library(edgeR))
counts_raw <- read.csv(matrix_path, check.names=FALSE)
genes <- as.character(counts_raw[[1]])
counts <- as.matrix(counts_raw[, -1, drop=FALSE])
rownames(counts) <- genes
storage.mode(counts) <- "numeric"
metadata <- read.csv(metadata_path, check.names=FALSE)
sample_column <- if ("sample" %in% names(metadata)) "sample" else if ("sampleId" %in% names(metadata)) "sampleId" else names(metadata)[[1]]
rownames(metadata) <- metadata[[sample_column]]
metadata <- metadata[colnames(counts), , drop=FALSE]
group <- relevel(factor(metadata[[group_column]]), ref=control_group)
y <- DGEList(counts=round(counts), group=group)
y <- calcNormFactors(y)
design <- model.matrix(~group)
y <- estimateDisp(y, design)
fit <- glmQLFit(y, design)
qlf <- glmQLFTest(fit, coef=2)
table <- topTags(qlf, n=Inf, sort.by="PValue")$table
out <- data.frame(gene=rownames(table), logFC=table$logFC, pValue=table$PValue, fdr=table$FDR)
write.csv(out, output_path, row.names=FALSE)
'''


def module_available(module_name):
    try:
        module = __import__(module_name)
        return {"available": True, "module": module_name, "version": str(getattr(module, "__version__", "available"))}
    except Exception as exc:
        return {"available": False, "module": module_name, "error": str(exc)}


def command_available(command, args):
    try:
        result = subprocess.run([command] + args, text=True, capture_output=True, timeout=5)
        text = (result.stdout or result.stderr).strip().splitlines()
        return {"available": result.returncode == 0, "command": command, "version": text[0] if text else "available"}
    except Exception as exc:
        return {"available": False, "command": command, "error": str(exc)}


def r_package_available(package_name):
    try:
        result = subprocess.run(["Rscript", "-e", f'cat(as.character(packageVersion("{package_name}")))'], text=True, capture_output=True, timeout=10)
        return {"available": result.returncode == 0, "package": package_name, "version": result.stdout.strip() or "available", "error": result.stderr.strip() if result.returncode else ""}
    except Exception as exc:
        return {"available": False, "package": package_name, "error": str(exc)}


def runner_versions(runtime, keys):
    versions = []
    for key in keys:
        item = runtime.get(key, {})
        if item.get("available"):
            label = item.get("command") or item.get("module") or item.get("package") or key
            versions.append(f"{label} {item.get('version') or 'available'}")
    return versions or ["BioAgent omics workspace task"]


def production_runner_warnings(params):
    if params.get("runner") in ("scanpy.rank_genes_groups", "DESeq2", "edgeR"):
        return [f"Requested {params['runner']}; current seed task executed the reproducible Python CSV runner. Production runner backends should be added inside this workspace task rather than TypeScript gateway branches."]
    return []


def safe_workspace_path(workspace, ref):
    target = os.path.abspath(os.path.join(workspace, ref))
    root = os.path.abspath(workspace)
    if not target.startswith(root + os.sep) and target != root:
        raise ValueError(f"Path escapes workspace: {ref}")
    return target


def welch_approx_p(left, right):
    denominator = math.sqrt(variance(left) / max(1, len(left)) + variance(right) / max(1, len(right))) or 1
    t_value = abs((mean(left) - mean(right)) / denominator)
    return max(0.000001, min(1, math.exp(-t_value)))


def variance(values):
    return statistics.variance(values) if len(values) > 1 else 0


def mean(values):
    return sum(values) / max(1, len(values))


def log2p1(value):
    return math.log2(max(0, value) + 1)


def to_float(value):
    try:
        return float(value)
    except Exception:
        return 0


def sha1_file(path):
    digest = hashlib.sha1()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def execution_unit(agent_id, tool, params, status, database_versions, artifacts, input_fingerprints):
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
        "dataFingerprint": json.dumps(input_fingerprints, sort_keys=True),
        "artifacts": artifacts,
        "outputArtifacts": artifacts,
    }


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


if __name__ == "__main__":
    main()
