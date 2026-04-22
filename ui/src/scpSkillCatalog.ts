export interface ScpMarkdownSkill {
  id: string;
  name: string;
  description: string;
  path: string;
  scpToolId?: string;
  scpHubUrl?: string;
}

export const scpMarkdownSkills = [
  {
    "id": "admet_druglikeness_report",
    "name": "admet_druglikeness_report",
    "description": "ADMET drug-likeness assessment tool evaluating Absorption, Distribution, Metabolism, Excretion, and Toxicity properties for compound optimization and drug discovery.",
    "path": "skills/installed/scp/admet_druglikeness_report/SKILL.md",
    "scpToolId": "201",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/admet_druglikeness_report"
  },
  {
    "id": "antibody_drug_development",
    "name": "antibody_drug_development",
    "description": "Antibody Drug Development - Develop antibody drugs: epitope prediction, humanness scoring, developability assessment, and immunogenicity prediction. Use this skill for biologics tasks involving predict epitope humanness score developability assess immunogenicity predict. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/antibody_drug_development/SKILL.md",
    "scpToolId": "6",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/6"
  },
  {
    "id": "antibody_target_analysis",
    "name": "antibody_target_analysis",
    "description": "Antibody Target Analysis - Identify and validate antibody drug targets through target antigen analysis, epitope mapping, and binding affinity prediction. Use this skill for antibody discovery tasks involving analyze target validate epitope predict binding affinity.",
    "path": "skills/installed/scp/antibody_target_analysis/SKILL.md",
    "scpToolId": "101",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/antibody_target_analysis"
  },
  {
    "id": "atc_drug_classification",
    "name": "atc_drug_classification",
    "description": "Classify drugs according to the Anatomical Therapeutic Chemical (ATC) classification system. Input a drug name, compound name, or SMILES string and receive the corresponding ATC code(s) with therapeutic hierarchy (Anatomical main group → Therapeutic subgroup → Pharmacological subgroup → Chemical subgroup → Chemical substance).",
    "path": "skills/installed/scp/atc_drug_classification/SKILL.md",
    "scpToolId": "atc_drug_classification",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/atc_drug_classification"
  },
  {
    "id": "binding_site_characterization",
    "name": "binding_site_characterization",
    "description": "Characterize protein binding sites including pocket detection, shape analysis, pharmacological features, and druggability assessment for structure-based drug design.",
    "path": "skills/installed/scp/binding_site_characterization/SKILL.md",
    "scpToolId": "201",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/binding_site_characterization"
  },
  {
    "id": "biomarker_discovery",
    "name": "biomarker_discovery",
    "description": "Biomarker Discovery - Identify and validate diagnostic, prognostic, and predictive biomarkers from omics data. Use this skill for biomarker tasks involving gene expression differential analysis pathway enrichment disease signature discovery. Combines multiple tools from SCP servers for multi-omics biomarker identification.",
    "path": "skills/installed/scp/biomarker_discovery/SKILL.md",
    "scpToolId": "110",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/biomarker_discovery"
  },
  {
    "id": "biomedical-web-search",
    "name": "biomedical-web-search",
    "description": "Search biomedical literature, databases, and clinical resources across PubMed, UniProt, DrugBank, and other life science repositories. Supports keyword search, MeSH terms, and filtered queries for genes, proteins, diseases, and compounds.",
    "path": "skills/installed/scp/biomedical-web-search/SKILL.md",
    "scpToolId": "biomedical-web-search",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/biomedical-web-search"
  },
  {
    "id": "cancer_therapy_design",
    "name": "cancer_therapy_design",
    "description": "Design personalized cancer therapeutic strategies by integrating multi-omics data including genomics, transcriptomics, and proteomics for target identification, drug selection, and biomarker discovery.",
    "path": "skills/installed/scp/cancer_therapy_design/SKILL.md",
    "scpToolId": "cancer_therapy_design",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/cancer_therapy_design"
  },
  {
    "id": "cell_line_assay_analysis",
    "name": "cell_line_assay_analysis",
    "description": "Cell Line Assay Analysis - Analyze cell-based assay data including viability, cytotoxicity, proliferation, and apoptosis assays. Use this skill for drug screening, IC50 determination, and cell viability assessment across different cell lines.",
    "path": "skills/installed/scp/cell_line_assay_analysis/SKILL.md",
    "scpToolId": "cell_line_assay_analysis",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/cell_line_assay_analysis"
  },
  {
    "id": "chembl-molecule-search",
    "name": "ChEMBL Molecule Search",
    "description": "Search the ChEMBL database for bioactive molecules, drug-like compounds, and their associated biological activity data. Supports search by compound name, SMILES, InChI, or ChEMBL ID.",
    "path": "skills/installed/scp/chembl-molecule-search/SKILL.md",
    "scpToolId": "chembl-molecule-search"
  },
  {
    "id": "chemical-mass-percent-calculation",
    "name": "chemical-mass-percent-calculation",
    "description": "Calculate mass percent composition of chemical compounds from molecular formula or SMILES.",
    "path": "skills/installed/scp/chemical-mass-percent-calculation/SKILL.md",
    "scpToolId": "23",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/23"
  },
  {
    "id": "chemical_safety_assessment",
    "name": "Chemical Safety Assessment",
    "description": "Evaluate chemical compound safety profiles including toxicity endpoints, hazard classification, MSDS generation, and regulatory compliance assessment. Supports GHS classification, LD50 analysis, and acute/chronic toxicity predictions.",
    "path": "skills/installed/scp/chemical_safety_assessment/SKILL.md",
    "scpToolId": "chemical_safety_assessment"
  },
  {
    "id": "chemical_structure_comparison",
    "name": "chemical_structure_comparison",
    "description": "Chemical Structure Comparison - Compare molecular structures using SMILES, molecular fingerprints, and structural similarity metrics. Use this skill for molecular similarity analysis, scaffold comparison, R-group analysis, and structure-activity relationship studies. Combines PubChem data with similarity algorithms.",
    "path": "skills/installed/scp/chemical_structure_comparison/SKILL.md",
    "scpToolId": "chemical_structure_comparison",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/chemical_structure_comparison"
  },
  {
    "id": "combinatorial_chemistry",
    "name": "combinatorial_chemistry",
    "description": "Combinatorial Chemistry Library Design - Design combinatorial library: validate core SMILES, generate variants, compute properties, and predict ADMET for library. Use this skill for combinatorial chemistry tasks involving is valid smiles calculate mol basic info calculate mol drug chemistry pred molecule admet. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/combinatorial_chemistry/SKILL.md",
    "scpToolId": "33",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/33"
  },
  {
    "id": "comparative_drug_analysis",
    "name": "comparative_drug_analysis",
    "description": "Comparative Drug Analysis - Compare drugs: mechanism of action, target profiling, pathway analysis, and clinical outcomes. Use this skill for comparative pharmacology tasks involving get drug mechanism get target profile get pathway analysis get clinical outcomes. Combines 4 tools from 3 SCP server(s).",
    "path": "skills/installed/scp/comparative_drug_analysis/SKILL.md",
    "scpToolId": "34",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/34"
  },
  {
    "id": "compound-name-retrieval",
    "name": "compound-name-retrieval",
    "description": "Retrieve chemical compounds by common name, synonyms, or brand names from multiple chemical databases.",
    "path": "skills/installed/scp/compound-name-retrieval/SKILL.md",
    "scpToolId": "35",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/35"
  },
  {
    "id": "compound_database_crossref",
    "name": "compound_database_crossref",
    "description": "Cross-reference chemical compounds across multiple databases including PubChem, ChEMBL, DrugBank, and ChemSpider.",
    "path": "skills/installed/scp/compound_database_crossref/SKILL.md",
    "scpToolId": "36",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/36"
  },
  {
    "id": "compound_to_drug_pipeline",
    "name": "Compound-to-Drug Pipeline",
    "description": "Multi-stage pipeline for drug discovery stages including ADMET prediction, target identification, lead optimization.",
    "path": "skills/installed/scp/compound_to_drug_pipeline/SKILL.md",
    "scpToolId": "compound_to_drug_pipeline"
  },
  {
    "id": "comprehensive-protein-analysis",
    "name": "comprehensive-protein-analysis",
    "description": "Comprehensive Protein Analysis - Analyze proteins: sequence features, structural predictions, functional domains, and post-translational modifications. Use this skill for proteomics tasks involving extract sequence features predict structure get functional domains predict PTMs. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/comprehensive-protein-analysis/SKILL.md",
    "scpToolId": "38",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/38"
  },
  {
    "id": "cross_species_genomics",
    "name": "cross_species_genomics",
    "description": "Cross-Species Comparative Genomics - Compare genomes across species: Ensembl comparisons, alignments, gene trees, and NCBI taxonomy. Use this skill for comparative genomics tasks involving get info get species set get aligned regions get genetree member symbol get taxonomy. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/cross_species_genomics/SKILL.md",
    "scpToolId": "40",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/40"
  },
  {
    "id": "disease_compound_pipeline",
    "name": "disease_compound_pipeline",
    "description": "Disease-Compound Pipeline - Link diseases to compounds: disease gene identification, target validation, compound screening, and efficacy prediction. Use this skill for drug discovery tasks involving identify disease genes validate targets screen compounds predict efficacy. Combines 4 tools from 3 SCP server(s).",
    "path": "skills/installed/scp/disease_compound_pipeline/SKILL.md",
    "scpToolId": "42",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/42"
  },
  {
    "id": "disease_knowledge_graph",
    "name": "disease_knowledge_graph",
    "description": "Disease Knowledge Graph - Build disease knowledge graph: disease relationships, gene associations, drug targets, and pathway connections. Use this skill for disease informatics tasks involving get disease relationships get disease genes get drug targets get pathway connections. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/disease_knowledge_graph/SKILL.md",
    "scpToolId": "44",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/44"
  },
  {
    "id": "disease_protein_profiling",
    "name": "disease_protein_profiling",
    "description": "Disease Protein Profiling - Profile a disease protein: UniProt data, AlphaFold structure, InterPro domains, phenotype associations from Ensembl. Use this skill for medical proteomics tasks involving query uniprot download alphafold structure query interpro get phenotype gene. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/disease_protein_profiling/SKILL.md",
    "scpToolId": "45",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/45"
  },
  {
    "id": "dna-rna-sequence-analysis",
    "name": "dna-rna-sequence-analysis",
    "description": "DNA/RNA Sequence Analysis - Analyze DNA/RNA sequences: sequence alignment, motif finding, expression analysis, and variant calling. Use this skill for genomics tasks involving align sequences find motifs analyze expression call variants. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/dna-rna-sequence-analysis/SKILL.md",
    "scpToolId": "46",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/46"
  },
  {
    "id": "dna-sequencing",
    "name": "dna-sequencing",
    "description": "DNA and RNA sequencing analysis tool for sequence validation, quality assessment, and bioinformatics processing of nucleotide sequences.",
    "path": "skills/installed/scp/dna-sequencing/SKILL.md",
    "scpToolId": "4",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/dna-sequencing"
  },
  {
    "id": "drug-screening-docking",
    "name": "drug-screening-docking",
    "description": "Comprehensive drug screening pipeline from molecular filtering through QED/ADMET criteria to protein-ligand docking, identifying promising drug candidates.",
    "path": "skills/installed/scp/drug-screening-docking/SKILL.md",
    "scpToolId": "47",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/47"
  },
  {
    "id": "drug_indication_mapping",
    "name": "drug_indication_mapping",
    "description": "Drug-Indication Mapping - Map drug indications: ChEMBL drug indications, FDA indications, OpenTargets drug associations, and literature. Use this skill for clinical informatics tasks involving get drug indication by id get indications by drug name get associated drugs by target name pubmed search. Combines 4 tools from 4 SCP server(s).",
    "path": "skills/installed/scp/drug_indication_mapping/SKILL.md",
    "scpToolId": "48",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/48"
  },
  {
    "id": "drug_interaction_checker",
    "name": "drug_interaction_checker",
    "description": "Drug-Drug Interaction Checker - Check interactions between multiple drugs using FDA interaction data, PubChem compound info, and ChEMBL target overlap analysis. Use this skill for clinical pharmacology tasks involving get drug interaction by drug name get compound by name get target by name. Combines 3 tools from 3 SCP server(s).",
    "path": "skills/installed/scp/drug_interaction_checker/SKILL.md",
    "scpToolId": "49",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/49"
  },
  {
    "id": "drug_metabolism_study",
    "name": "drug_metabolism_study",
    "description": "Drug Metabolism Study - Analyze drug metabolism pathways, predict metabolites, and assess metabolic stability. Use this skill for ADME studies, metabolite prediction, enzyme interaction analysis, and pharmacokinetic profiling. Supports cytochrome P450 metabolism and phase I/II reaction prediction.",
    "path": "skills/installed/scp/drug_metabolism_study/SKILL.md",
    "scpToolId": "drug_metabolism_study",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/drug_metabolism_study"
  },
  {
    "id": "drug_repurposing_screen",
    "name": "drug_repurposing_screen",
    "description": "Drug Repurposing Screen - Screen drugs for repurposing: target identification, disease matching, safety profiling, and efficacy prediction. Use this skill for drug discovery tasks involving identify targets match diseases profile safety predict efficacy. Combines 4 tools from 3 SCP server(s).",
    "path": "skills/installed/scp/drug_repurposing_screen/SKILL.md",
    "scpToolId": "51",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/51"
  },
  {
    "id": "drug_safety_profile",
    "name": "drug_safety_profile",
    "description": "Drug Safety Profile - Profile drug safety: adverse reactions, toxicity prediction, drug interactions, and contraindications. Use this skill for pharmacology tasks involving get adverse reactions predict toxicity check interactions get contraindications. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/drug_safety_profile/SKILL.md",
    "scpToolId": "52",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/52"
  },
  {
    "id": "drug_target_structure",
    "name": "Drug Target Structure",
    "description": "Analyze and predict drug-protein binding structures. Supports target identification, binding pose prediction, and structure-activity relationship analysis for drug discovery.",
    "path": "skills/installed/scp/drug_target_structure/SKILL.md",
    "scpToolId": "drug_target_structure"
  },
  {
    "id": "drug_warning_report",
    "name": "Drug Warning Report",
    "description": "Drug safety warnings, black box warnings, contraindications from FDA/EMA/NMPA.",
    "path": "skills/installed/scp/drug_warning_report/SKILL.md",
    "scpToolId": "drug_warning_report"
  },
  {
    "id": "drugsda-admet",
    "name": "drugsda-admet",
    "description": "Predict the ADMET (absorption, distribution, metabolism, excretion, and toxicity) properties of the input molecules.",
    "path": "skills/installed/scp/drugsda-admet/SKILL.md",
    "scpToolId": "56",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/56"
  },
  {
    "id": "drugsda-compound-retrieve",
    "name": "drugsda-compound-retrieve",
    "description": "Retrieve compound information from DrugSDA database including structures, properties, and literature references.",
    "path": "skills/installed/scp/drugsda-compound-retrieve/SKILL.md",
    "scpToolId": "57",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/57"
  },
  {
    "id": "drugsda-denovo-sampling",
    "name": "DrugSDA De Novo Sampling",
    "description": "Generate novel drug-like molecules using deep learning de novo molecular design. Receives a SMILES string or pharmacophore constraints, then produces new candidate molecules with desired properties through generative models.",
    "path": "skills/installed/scp/drugsda-denovo-sampling/SKILL.md",
    "scpToolId": "drugsda-denovo-sampling"
  },
  {
    "id": "drugsda-drug-likeness",
    "name": "drugsda-drug-likeness",
    "description": "Drug Likeness Assessment - Evaluate compound drug-likeness using Lipinski's rule of five, Veber's criteria, and other pharmaceutical filters. Use this skill for drug discovery tasks involving rule-of-five ADME prediction oral bioavailability molecular property filtering. Assess compound developability and medicinal chemistry potential.",
    "path": "skills/installed/scp/drugsda-drug-likeness/SKILL.md",
    "scpToolId": "66",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/drugsda-drug-likeness"
  },
  {
    "id": "drugsda-esmfold",
    "name": "drugsda-esmfold",
    "description": "Use ESMFold model to predict 3D structure of the input protein sequence.",
    "path": "skills/installed/scp/drugsda-esmfold/SKILL.md",
    "scpToolId": "62",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/62"
  },
  {
    "id": "drugsda-linker-sampling",
    "name": "drugsda-linker-sampling",
    "description": "Sample chemical linkers for molecular fusion connecting two pharmacophores with optimal properties.",
    "path": "skills/installed/scp/drugsda-linker-sampling/SKILL.md",
    "scpToolId": "64",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/64"
  },
  {
    "id": "drugsda-mol-properties",
    "name": "drugsda-mol-properties",
    "description": "Calculate different types of molecular properties based on SMILES strings, covering basic physicochemical properties, hydrophobicity, hydrogen bonding capability, molecular complexity, topological structures, charge distribution, and custom complexity metrics, respectively.",
    "path": "skills/installed/scp/drugsda-mol-properties/SKILL.md",
    "scpToolId": "65",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/65"
  },
  {
    "id": "drugsda-mol-similarity",
    "name": "drugsda-mol-similarity",
    "description": "Search for similar molecules in DrugSDA database using molecular fingerprints and Tanimoto similarity.",
    "path": "skills/installed/scp/drugsda-mol-similarity/SKILL.md",
    "scpToolId": "66",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/66"
  },
  {
    "id": "drugsda-mol2mol-sampling",
    "name": "DrugSDA Mol2Mol Sampling",
    "description": "Generate novel molecules using Mol2Mol transformer models.",
    "path": "skills/installed/scp/drugsda-mol2mol-sampling/SKILL.md",
    "scpToolId": "drugsda-mol2mol-sampling"
  },
  {
    "id": "drugsda-p2rank",
    "name": "drugsda-p2rank",
    "description": "Predict protein binding sites using P2Rank machine learning algorithm for druggable site identification.",
    "path": "skills/installed/scp/drugsda-p2rank/SKILL.md",
    "scpToolId": "68",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/68"
  },
  {
    "id": "drugsda-peptide-sampling",
    "name": "drugsda-peptide-sampling",
    "description": "Design and generate novel therapeutic peptides using deep learning models, predicting secondary structure, stability, and target binding affinity for peptide drug discovery.",
    "path": "skills/installed/scp/drugsda-peptide-sampling/SKILL.md",
    "scpToolId": "201",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/drugsda-peptide-sampling"
  },
  {
    "id": "drugsda-rgroup-sampling",
    "name": "drugsda-rgroup-sampling",
    "description": "DrugSDA R-Group Sampling - Generate R-group substituents and scaffold modifications using generative AI models. Use this skill for lead optimization, structure-activity relationship exploration, and multi-objective molecular generation with specified attachment points.",
    "path": "skills/installed/scp/drugsda-rgroup-sampling/SKILL.md",
    "scpToolId": "drugsda-rgroup-sampling",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/drugsda-rgroup-sampling"
  },
  {
    "id": "drugsda-target-retrieve",
    "name": "DrugSDA Target Retrieve",
    "description": "Identify protein targets for drug molecules using similarity and binding prediction.",
    "path": "skills/installed/scp/drugsda-target-retrieve/SKILL.md",
    "scpToolId": "drugsda-target-retrieve"
  },
  {
    "id": "enetic_counseling_report",
    "name": "enetic_counseling_report",
    "description": "Genetic Counseling Report - Generate genetic counseling reports: variant interpretation, inheritance patterns, recurrence risks, and clinical recommendations. Use this skill for clinical genetics tasks involving interpret variants determine inheritance calculate recurrence recommend clinically. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/enetic_counseling_report/SKILL.md",
    "scpToolId": "92",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/92"
  },
  {
    "id": "ensembl-sequence-retrieval",
    "name": "ensembl-sequence-retrieval",
    "description": "Retrieve DNA, RNA, and protein sequences from Ensembl database for any species and gene region.",
    "path": "skills/installed/scp/ensembl-sequence-retrieval/SKILL.md",
    "scpToolId": "76",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/76"
  },
  {
    "id": "enzyme_inhibitor_design",
    "name": "Enzyme Inhibitor Design",
    "description": "Design and optimize enzyme inhibitors for therapeutic applications. Supports competitive, non-competitive, and allosteric inhibitor screening with Ki/Km analysis.",
    "path": "skills/installed/scp/enzyme_inhibitor_design/SKILL.md",
    "scpToolId": "enzyme_inhibitor_design"
  },
  {
    "id": "epigenetics_drug",
    "name": "epigenetics_drug",
    "description": "Epigenetics Drug Analysis - Analyze epigenetic drugs: histone modification targeting, DNA methylation patterns, epigenetic enzyme inhibition, and chromatin remodeling. Use this skill for epigenomics tasks involving get histone targets get methylation patterns get enzyme inhibition get chromatin analysis. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/epigenetics_drug/SKILL.md",
    "scpToolId": "79",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/79"
  },
  {
    "id": "example-bio-chem-tool",
    "name": "Example Bio-Chem Tool",
    "description": "Example biochemistry tool template for SCP Hub local skill development. Demonstrates the standard SKILL.md structure with frontmatter, MCP invocation schema, and local description format.",
    "path": "skills/installed/scp/example-bio-chem-tool/SKILL.md",
    "scpToolId": "example-bio-chem-tool"
  },
  {
    "id": "fda-drug-risk-assessment",
    "name": "fda-drug-risk-assessment",
    "description": "FDA Drug Risk Assessment - Assess drug risks from FDA data: black box warnings, adverse event reports, recall history, and safety communications. Use this skill for pharmacovigilance tasks involving get black box warnings get adverse events get recall history get safety communications. Combines 4 tools from 1 SCP server(s).",
    "path": "skills/installed/scp/fda-drug-risk-assessment/SKILL.md",
    "scpToolId": "81",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/81"
  },
  {
    "id": "full_protein_analysis",
    "name": "full_protein_analysis",
    "description": "Full Protein Analysis - Comprehensive protein sequence and structure analysis including functional annotation, domain identification, post-translational modification prediction, and variant impact assessment. Use this skill for complete protein characterization combining multiple bioinformatics tools.",
    "path": "skills/installed/scp/full_protein_analysis/SKILL.md",
    "scpToolId": "full_protein_analysis",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/full_protein_analysis"
  },
  {
    "id": "functional_group_profiling",
    "name": "functional_group_profiling",
    "description": "Functional Group Profiling - Profile functional groups: radical assignment, H-bond analysis, aromaticity, and abbreviation condensation. Use this skill for organic chemistry tasks involving AssignRadicals GetHBANum AromaticityAnalyzer CondenseAbbreviationSubstanceGroups. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/functional_group_profiling/SKILL.md",
    "scpToolId": "83",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/83"
  },
  {
    "id": "gene_disease_association",
    "name": "gene_disease_association",
    "description": "Gene-Disease Association - Explore and analyze associations between genes and diseases. Use this skill for tasks involving disease gene mapping, phenotype-gene linking, GWAS target prioritization, and pathogenicity screening. Combines multiple SCP servers for genomics and clinical genetics analysis.",
    "path": "skills/installed/scp/gene_disease_association/SKILL.md",
    "scpToolId": "gene_disease_association",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/gene_disease_association"
  },
  {
    "id": "gene_family_evolution",
    "name": "gene_family_evolution",
    "description": "Gene Family Evolution Analysis - Analyze gene family evolution: CAFE gene tree, homology, Ensembl gene tree, and taxonomy. Use this skill for molecular evolution tasks involving get cafe genetree member symbol get homology symbol get genetree member symbol get taxonomy classification. Combines 4 tools from 1 SCP server(s).",
    "path": "skills/installed/scp/gene_family_evolution/SKILL.md",
    "scpToolId": "88",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/88"
  },
  {
    "id": "gene_therapy_target",
    "name": "gene_therapy_target",
    "description": "Gene Therapy Target Identification - Identify gene therapy targets: disease gene prioritization, delivery vector selection, off-target analysis, and efficacy prediction. Use this skill for gene therapy tasks involving prioritize genes select vectors analyze off-targets predict efficacy. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/gene_therapy_target/SKILL.md",
    "scpToolId": "89",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/89"
  },
  {
    "id": "genome_annotation",
    "name": "Genome Annotation",
    "description": "Perform automated genome annotation by identifying and classifying genomic features including genes, exons, introns, promoters, regulatory regions, and other functional elements. Supports both prokaryotic and eukaryotic genome annotation workflows.",
    "path": "skills/installed/scp/genome_annotation/SKILL.md",
    "scpToolId": "genome_annotation"
  },
  {
    "id": "go_term_analysis",
    "name": "GO Term Analysis",
    "description": "Perform Gene Ontology enrichment analysis and functional annotation. Supports GO Slim mapping, pathway enrichment, and gene set analysis for genomics datasets.",
    "path": "skills/installed/scp/go_term_analysis/SKILL.md",
    "scpToolId": "go_term_analysis"
  },
  {
    "id": "infectious_disease_analysis",
    "name": "infectious_disease_analysis",
    "description": "Infectious Disease Analysis - Analyze infectious diseases: pathogen identification, transmission tracking, antimicrobial resistance, and outbreak prediction. Use this skill for infectious disease tasks involving identify pathogens track transmission monitor resistance predict outbreaks. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/infectious_disease_analysis/SKILL.md",
    "scpToolId": "97",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/97"
  },
  {
    "id": "interproscan-domain-analysis",
    "name": "interproscan-domain-analysis",
    "description": "Analyze protein sequences for functional domains using InterProScan database and prediction tools.",
    "path": "skills/installed/scp/interproscan-domain-analysis/SKILL.md",
    "scpToolId": "98",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/98"
  },
  {
    "id": "interproscan_pipeline",
    "name": "InterProScan Pipeline",
    "description": "Predict protein domain families and functional annotation using InterProScan. Input a protein sequence and receive domain architecture, Gene Ontology (GO) terms, pathway annotations, and cross-references to protein databases including Pfam, SMART, PANTHER, and CDD.",
    "path": "skills/installed/scp/interproscan_pipeline/SKILL.md",
    "scpToolId": "interproscan_pipeline"
  },
  {
    "id": "kegg-gene-search",
    "name": "KEGG Gene Search",
    "description": "Query and retrieve gene information from the Kyoto Encyclopedia of Genes and Genomes (KEGG) database. Search genes by identifier, pathway, or function and retrieve associated information including orthologs, enzymes, pathways, and disease associations.",
    "path": "skills/installed/scp/kegg-gene-search/SKILL.md",
    "scpToolId": "kegg-gene-search"
  },
  {
    "id": "lead_compound_optimization",
    "name": "lead_compound_optimization",
    "description": "Lead Compound Optimization - Optimize lead compounds through iterative medicinal chemistry modifications guided by structure-activity relationships. Use this skill for drug discovery tasks involving SAR analysis pharmacophore modeling molecular modification bioisosteric replacement. Transform hits to leads with improved potency and ADMET properties.",
    "path": "skills/installed/scp/lead_compound_optimization/SKILL.md",
    "scpToolId": "115",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/lead_compound_optimization"
  },
  {
    "id": "metabolomics_pathway",
    "name": "metabolomics_pathway",
    "description": "Metabolomics Pathway Analysis - Analyze metabolomics: compound identification, KEGG pathway mapping, enzyme linking, and PubChem data. Use this skill for metabolomics tasks involving kegg find kegg link kegg get pubchem search by name. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/metabolomics_pathway/SKILL.md",
    "scpToolId": "107",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/107"
  },
  {
    "id": "molecular-descriptors-calculation",
    "name": "molecular-descriptors-calculation",
    "description": "Calculate advanced molecular descriptors including QSAR and shape indices, connectivity indices, and structural features for drug discovery.",
    "path": "skills/installed/scp/molecular-descriptors-calculation/SKILL.md",
    "scpToolId": "110",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/110"
  },
  {
    "id": "molecular-docking",
    "name": "molecular-docking",
    "description": "Molecular docking tool for predicting binding modes and affinity between small molecules and protein targets.",
    "path": "skills/installed/scp/molecular-docking/SKILL.md",
    "scpToolId": "32",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/molecular-docking"
  },
  {
    "id": "molecular-properties-calculation",
    "name": "molecular-properties-calculation",
    "description": "Calculate basic molecular properties from SMILES including molecular weight, formula, atom count, and exact mass.",
    "path": "skills/installed/scp/molecular-properties-calculation/SKILL.md",
    "scpToolId": "112",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/112"
  },
  {
    "id": "molecular-property-profiling",
    "name": "molecular-property-profiling",
    "description": "Comprehensive molecular property analysis covering basic info, hydrophobicity, hydrogen bonding, structural complexity, topology, drug-likeness, charge distribution, and complexity metrics.",
    "path": "skills/installed/scp/molecular-property-profiling/SKILL.md",
    "scpToolId": "113",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/113"
  },
  {
    "id": "molecular-similarity-search",
    "name": "molecular-similarity-search",
    "description": "Search similar molecules using Tanimoto similarity with Morgan fingerprints to identify structurally related compounds.",
    "path": "skills/installed/scp/molecular-similarity-search/SKILL.md",
    "scpToolId": "114",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/114"
  },
  {
    "id": "molecular_docking_pipeline",
    "name": "molecular_docking_pipeline",
    "description": "Molecular Docking Pipeline - Dock molecules to proteins: structure preparation, binding site identification, docking simulation, and affinity prediction. Use this skill for structural biology tasks involving prepare structure identify site simulate docking predict affinity. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/molecular_docking_pipeline/SKILL.md",
    "scpToolId": "115",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/115"
  },
  {
    "id": "molecular_fingerprint_analysis",
    "name": "molecular_fingerprint_analysis",
    "description": "Molecular Fingerprint Analysis - Analyze molecular fingerprints: Morgan fingerprints, MACCS keys, topological fingerprints, and pharmacophore patterns. Use this skill for cheminformatics tasks involving generate morgan generate maccs generate topological analyze pharmacophore. Combines 4 tools from 1 SCP server(s).",
    "path": "skills/installed/scp/molecular_fingerprint_analysis/SKILL.md",
    "scpToolId": "116",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/116"
  },
  {
    "id": "molecular_visualization_suite",
    "name": "molecular_visualization_suite",
    "description": "Molecular Visualization Suite - Visualize molecules: SMILES to formats, molecular visualization, protein visualization, complex visualization. Use this skill for chemistry visualization tasks involving smiles to format visualize molecule visualize protein visualize complex. Combines 4 tools from 1 SCP server(s).",
    "path": "skills/installed/scp/molecular_visualization_suite/SKILL.md",
    "scpToolId": "117",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/117"
  },
  {
    "id": "mouse_model_analysis",
    "name": "mouse_model_analysis",
    "description": "Mouse Model Analysis - Analyze mouse models: phenotype data, genetic modifications, disease relevance, and translational potential. Use this skill for model biology tasks involving get phenotype data get genetic mods get disease relevance assess translation. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/mouse_model_analysis/SKILL.md",
    "scpToolId": "118",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/118"
  },
  {
    "id": "multispecies_gene_analysis",
    "name": "multispecies_gene_analysis",
    "description": "Multispecies Gene Analysis - Analyze genes across species: orthology mapping, conservation analysis, expression profiling, and functional annotation. Use this skill for molecular biology tasks involving map orthology analyze conservation profile expression annotate function. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/multispecies_gene_analysis/SKILL.md",
    "scpToolId": "120",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/120"
  },
  {
    "id": "natural_product_analysis",
    "name": "natural_product_analysis",
    "description": "Natural Product Analysis - Analyze natural products: name-to-SMILES, PubChem lookup, structural analysis, and KEGG natural product search. Use this skill for natural product chemistry tasks involving NameToSMILES ChemicalStructureAnalyzer kegg find pubchem search by name. Combines 4 tools from 4 SCP server(s).",
    "path": "skills/installed/scp/natural_product_analysis/SKILL.md",
    "scpToolId": "121",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/121"
  },
  {
    "id": "ncbi-gene-retrieval",
    "name": "ncbi-gene-retrieval",
    "description": "Retrieve gene information from NCBI including sequences, aliases, summaries, and genomic location.",
    "path": "skills/installed/scp/ncbi-gene-retrieval/SKILL.md",
    "scpToolId": "122",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/122"
  },
  {
    "id": "ncbi_gene_deep_dive",
    "name": "ncbi_gene_deep_dive",
    "description": "NCBI Gene Deep Dive - Deep dive into gene data: comprehensive retrieval, pathway involvement, disease associations, and literature mining. Use this skill for gene biology tasks involving get comprehensive gene data get pathway involvement get disease associations mine literature. Combines 4 tools from 1 SCP server(s).",
    "path": "skills/installed/scp/ncbi_gene_deep_dive/SKILL.md",
    "scpToolId": "123",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/123"
  },
  {
    "id": "one_health_analysis",
    "name": "one_health_analysis",
    "description": "One Health Pathogen Analysis - One Health analysis: pathogen genomes, cross-species gene comparisons, antimicrobial drugs, and environmental context. Use this skill for one health tasks involving get genomic dataset report by taxonomy get homology symbol by drug name get mechanism of action get quick search get taxonomy. Combines 5 tools from 4 SCP server(s).",
    "path": "skills/installed/scp/one_health_analysis/SKILL.md",
    "scpToolId": "126",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/126"
  },
  {
    "id": "opentargets-disease-target",
    "name": "opentargets-disease-target",
    "description": "Use disease EFO ID to retrieve disease-related targets from OpenTargets to identify therapeutic targets.",
    "path": "skills/installed/scp/opentargets-disease-target/SKILL.md",
    "scpToolId": "127",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/127"
  },
  {
    "id": "organism_classification",
    "name": "organism_classification",
    "description": "Organism Classification Database - Classify organisms: NCBI taxonomy, Ensembl classification, ChEMBL organisms, and genomic information. Use this skill for taxonomy tasks involving get taxonomy get taxonomy ID get organism by taxonomy ID get genomic dataset report by taxonomy. Combines 4 tools from 3 SCP server(s).",
    "path": "skills/installed/scp/organism_classification/SKILL.md",
    "scpToolId": "130",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/130"
  },
  {
    "id": "orphan_drug_analysis",
    "name": "orphan_drug_analysis",
    "description": "Orphan Drug and Rare Disease Analysis - Analyze orphan drugs: Monarch disease phenotypes, OpenTargets targets, FDA drug data, and clinical studies. Use this skill for orphan drug development tasks involving get joint related disease by HPO ID list get related targets by disease EFO ID get clinical study info by drug name pubmed search. Combines 4 tools from 4 SCP server(s).",
    "path": "skills/installed/scp/orphan_drug_analysis/SKILL.md",
    "scpToolId": "131",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/131"
  },
  {
    "id": "pandemic_preparedness",
    "name": "pandemic_preparedness",
    "description": "Pandemic Preparedness Analysis - Analyze pandemic preparedness: pathogen surveillance, transmission modeling, therapeutic development, and public health interventions. Use this skill for public health tasks involving monitor pathogens model transmission develop therapeutics plan interventions. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/pandemic_preparedness/SKILL.md",
    "scpToolId": "132",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/132"
  },
  {
    "id": "pediatric_drug_safety",
    "name": "pediatric_drug_safety",
    "description": "Pediatric Drug Safety Review - Evaluate pediatric drug safety: pediatric use information from FDA, child safety, dosage forms, and overdose information. Use this skill for pediatric pharmacology tasks involving get pediatric use info by drug name get child safety info by drug name get dosage forms and specs by drug name get overdose info by drug name. Combines 4 tools from 1 SCP server(s).",
    "path": "skills/installed/scp/pediatric_drug_safety/SKILL.md",
    "scpToolId": "133",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/133"
  },
  {
    "id": "peptide-properties-calculation",
    "name": "peptide-properties-calculation",
    "description": "Calculate peptide properties including isoelectric point, hydrophobicity, charge, and stability predictions.",
    "path": "skills/installed/scp/peptide-properties-calculation/SKILL.md",
    "scpToolId": "134",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/134"
  },
  {
    "id": "personalized_medicine",
    "name": "personalized_medicine",
    "description": "Personalized Medicine Analysis - Analyze for personalized medicine: genomic markers, drug response prediction, treatment optimization, and outcome prediction. Use this skill for precision medicine tasks involving find genomic markers predict drug response optimize treatment predict outcomes. Combines 4 tools from 3 SCP server(s).",
    "path": "skills/installed/scp/personalized_medicine/SKILL.md",
    "scpToolId": "135",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/135"
  },
  {
    "id": "pharmacogenomics_analysis",
    "name": "pharmacogenomics_analysis",
    "description": "Pharmacogenomics Analysis - Analyze pharmacogenomics: drug response genes, variant effects, dosing recommendations, and adverse reaction predictions. Use this skill for pharmacogenomics tasks involving get drug response genes predict variant effects recommend dosing predict adverse reactions. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/pharmacogenomics_analysis/SKILL.md",
    "scpToolId": "136",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/136"
  },
  {
    "id": "pharmacokinetics_profile",
    "name": "pharmacokinetics_profile",
    "description": "Pharmacokinetics Profile - Profile drug pharmacokinetics: absorption prediction, distribution modeling, metabolism pathways, excretion kinetics, and drug-drug interactions. Use this skill for pharmacology tasks involving predict absorption model distribution map metabolism predict excretion. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/pharmacokinetics_profile/SKILL.md",
    "scpToolId": "137",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/137"
  },
  {
    "id": "phenotype-by-hpo-id",
    "name": "phenotype-by-hpo-id",
    "description": "Retrieve clinical phenotypes and associated genes using Human Phenotype Ontology (HPO) IDs.",
    "path": "skills/installed/scp/phenotype-by-hpo-id/SKILL.md",
    "scpToolId": "138",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/138"
  },
  {
    "id": "polypharmacology_analysis",
    "name": "polypharmacology_analysis",
    "description": "Polypharmacology Analysis - Analyze polypharmacology: multi-target profiling, pathway network analysis, selectivity assessment, and combination therapy design. Use this skill for pharmacology tasks involving profile multi-targets analyze networks assess selectivity design combinations. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/polypharmacology_analysis/SKILL.md",
    "scpToolId": "140",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/140"
  },
  {
    "id": "population_genetics",
    "name": "population_genetics",
    "description": "Population Genetics Analysis - Analyze population genetics: allele frequency, linkage disequilibrium, selection signatures, and ancestry inference. Use this skill for population genetics tasks involving get allele frequencies calculate LD detect selection infer ancestry. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/population_genetics/SKILL.md",
    "scpToolId": "141",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/141"
  },
  {
    "id": "precision_oncology",
    "name": "precision_oncology",
    "description": "Precision Oncology Analysis - Analyze precision oncology: tumor profiling, target identification, treatment matching, and resistance prediction. Use this skill for precision oncology tasks involving profile tumor identify targets match treatments predict resistance. Combines 4 tools from 3 SCP server(s).",
    "path": "skills/installed/scp/precision_oncology/SKILL.md",
    "scpToolId": "142",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/142"
  },
  {
    "id": "protein-blast-search",
    "name": "protein-blast-search",
    "description": "Search for similar protein sequences in UniProt Swiss-Prot database using BLAST to identify homologous proteins and functional relationships.",
    "path": "skills/installed/scp/protein-blast-search/SKILL.md",
    "scpToolId": "143",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/143"
  },
  {
    "id": "protein-properties-calculation",
    "name": "protein-properties-calculation",
    "description": "Calculate physicochemical properties of protein sequences including molecular weight, isoelectric point, instability index, and amino acid composition.",
    "path": "skills/installed/scp/protein-properties-calculation/SKILL.md",
    "scpToolId": "1",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/protein-properties-calculation"
  },
  {
    "id": "protein_classification_analysis",
    "name": "protein_classification_analysis",
    "description": "Protein Classification Analysis - Classify proteins into families, structural classes, and functional categories using machine learning models. Use this skill for tasks involving InterPro domain mapping, enzyme classification (EC numbers), GO term annotation, and protein family assignment. Supports batch analysis of protein sequences and identifiers.",
    "path": "skills/installed/scp/protein_classification_analysis/SKILL.md",
    "scpToolId": "protein_classification_analysis",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/protein_classification_analysis"
  },
  {
    "id": "protein_complex_analysis",
    "name": "protein_complex_analysis",
    "description": "Protein Complex Analysis - Analyze protein-protein interactions, predict complex structures, and characterize quaternary structure. Use this skill for PPI network analysis, complex structure prediction, and interaction interface characterization.",
    "path": "skills/installed/scp/protein_complex_analysis/SKILL.md",
    "scpToolId": "protein_complex_analysis",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/protein_complex_analysis"
  },
  {
    "id": "protein_database_crossref",
    "name": "Protein Database CrossRef",
    "description": "Cross-reference protein data across multiple databases including UniProt, PDB, Pfam, InterPro, and Gene Ontology. Aggregate protein annotations and functional data from authoritative sources.",
    "path": "skills/installed/scp/protein_database_crossref/SKILL.md",
    "scpToolId": "protein_database_crossref"
  },
  {
    "id": "protein_engineering",
    "name": "Protein Engineering",
    "description": "Design and optimize protein sequences for desired properties including stability, solubility, catalytic activity, and binding affinity. Supports point mutation design, truncation analysis, fusion protein design, and thermostability optimization using structure-aware deep learning models.",
    "path": "skills/installed/scp/protein_engineering/SKILL.md",
    "scpToolId": "protein_engineering"
  },
  {
    "id": "protein_property_comparison",
    "name": "protein_property_comparison",
    "description": "Compare physicochemical properties, structural features, and functional annotations between multiple proteins for evolutionary analysis and functional characterization.",
    "path": "skills/installed/scp/protein_property_comparison/SKILL.md",
    "scpToolId": "201",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/protein_property_comparison"
  },
  {
    "id": "protein_quality_assessment",
    "name": "protein_quality_assessment",
    "description": "Protein Quality Assessment - Evaluate protein structure quality, stability, and reliability using various quality metrics and validation scores. Use this skill for quality control of modeled protein structures, assessment of X-ray/NMR structures, and confidence scoring for predictions.",
    "path": "skills/installed/scp/protein_quality_assessment/SKILL.md",
    "scpToolId": "110",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/protein_quality_assessment"
  },
  {
    "id": "protein_similarity_search",
    "name": "Protein Similarity Search",
    "description": "SCP skill for protein_similarity_search.",
    "path": "skills/installed/scp/protein_similarity_search/SKILL.md",
    "scpToolId": "protein_similarity_search"
  },
  {
    "id": "protein_structure_analysis",
    "name": "Protein Structure Analysis",
    "description": "Analyze protein 3D structures to predict secondary structure elements (alpha-helices, beta-strands), domain boundaries, solvent accessibility, and structural homology. Integrates with AlphaFold predictions and experimental structure databases (PDB).",
    "path": "skills/installed/scp/protein_structure_analysis/SKILL.md",
    "scpToolId": "protein_structure_analysis"
  },
  {
    "id": "pubchem_deep_dive",
    "name": "PubChem Deep Dive",
    "description": "Comprehensive PubChem database exploration including compound properties, bioactivity data, spectral information, and patent records. Supports CID/SMILES/InChI queries.",
    "path": "skills/installed/scp/pubchem_deep_dive/SKILL.md",
    "scpToolId": "pubchem_deep_dive"
  },
  {
    "id": "rare_disease_genetics",
    "name": "Rare Disease Genetics",
    "description": "Identify and analyze genetic variants associated with rare diseases using multi-omics data integration, phenotype matching via HPO terms, and literature mining. Supports variant prioritization, pathway analysis, and clinical interpretation for undiagnosed rare disease cases.",
    "path": "skills/installed/scp/rare_disease_genetics/SKILL.md",
    "scpToolId": "rare_disease_genetics"
  },
  {
    "id": "regulatory_region_analysis",
    "name": "Regulatory Region Analysis",
    "description": "Analyze genomic regulatory regions such as promoters, enhancers, silencers, transcription factor binding sites, and chromatin accessibility intervals. Supports motif scanning, cis-regulatory annotation, and candidate regulatory element prioritization.",
    "path": "skills/installed/scp/regulatory_region_analysis/SKILL.md",
    "scpToolId": "regulatory_region_analysis"
  },
  {
    "id": "sequence-alignment-pairwise",
    "name": "sequence-alignment-pairwise",
    "description": "Pairwise sequence alignment tool for DNA, RNA, and protein sequences with global and local alignment modes.",
    "path": "skills/installed/scp/sequence-alignment-pairwise/SKILL.md",
    "scpToolId": "3",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/sequence-alignment-pairwise"
  },
  {
    "id": "smiles_comprehensive_analysis",
    "name": "smiles_comprehensive_analysis",
    "description": "SMILES Comprehensive Analysis - Comprehensive analysis of molecules from SMILES: structure validation, property calculation, similarity search, and reaction prediction. Use this skill for cheminformatics tasks involving validate SMILES calculate properties search similar predict reactions. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/smiles_comprehensive_analysis/SKILL.md",
    "scpToolId": "173",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/173"
  },
  {
    "id": "structural_pharmacogenomics",
    "name": "structural_pharmacogenomics",
    "description": "Structural Pharmacogenomics - Analyze genetic variants in drug target proteins and predict their impact on drug response using structural information. Use this skill for pharmacogenomics tasks involving variant effect prediction drug response SNP protein structure genotype phenotype. Link genomic variations to drug efficacy and toxicity.",
    "path": "skills/installed/scp/structural_pharmacogenomics/SKILL.md",
    "scpToolId": "118",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/structural_pharmacogenomics"
  },
  {
    "id": "substance_toxicology",
    "name": "Substance Toxicology",
    "description": "SCP skill for substance_toxicology.",
    "path": "skills/installed/scp/substance_toxicology/SKILL.md",
    "scpToolId": "substance_toxicology"
  },
  {
    "id": "substructure_activity_search",
    "name": "Substructure Activity Search",
    "description": "Perform substructure-based activity relationship (SAR) analysis to identify molecular substructures associated with biological activity. Supports SMILES/MOL file input, scaffold analysis, and activity cliff detection for drug discovery.",
    "path": "skills/installed/scp/substructure_activity_search/SKILL.md",
    "scpToolId": "substructure_activity_search"
  },
  {
    "id": "synthetic_biology_design",
    "name": "Synthetic Biology Design",
    "description": "Design synthetic biology constructs including gene circuits, CRISPR components, and metabolic pathways. Supports pathway optimization and gene expression vector design.",
    "path": "skills/installed/scp/synthetic_biology_design/SKILL.md",
    "scpToolId": "synthetic_biology_design"
  },
  {
    "id": "systems_pharmacology",
    "name": "Systems Pharmacology",
    "description": "SCP skill for systems_pharmacology.",
    "path": "skills/installed/scp/systems_pharmacology/SKILL.md",
    "scpToolId": "systems_pharmacology"
  },
  {
    "id": "tcga-gene-expression",
    "name": "TCGA Gene Expression",
    "description": "Query and analyze tumor gene expression profiles from The Cancer Genome Atlas (TCGA). Supports cohort-level expression lookup, tumor-versus-normal comparison, subtype stratification, and candidate biomarker exploration across cancer types.",
    "path": "skills/installed/scp/tcga-gene-expression/SKILL.md",
    "scpToolId": "tcga-gene-expression"
  },
  {
    "id": "tissue_specific_analysis",
    "name": "Tissue Specific Analysis",
    "description": "Analyze gene expression patterns across different tissue types to identify tissue-specific genes, functional enrichment in specific tissues, and cross-tissue regulatory networks. Integrates with GTEx, human protein atlas, and other expression databases.",
    "path": "skills/installed/scp/tissue_specific_analysis/SKILL.md",
    "scpToolId": "tissue_specific_analysis"
  },
  {
    "id": "uniprot-protein-retrieval",
    "name": "UniProt Protein Retrieval",
    "description": "SCP skill for uniprot-protein-retrieval.",
    "path": "skills/installed/scp/uniprot-protein-retrieval/SKILL.md",
    "scpToolId": "uniprot-protein-retrieval"
  },
  {
    "id": "variant-functional-prediction",
    "name": "variant-functional-prediction",
    "description": "Predict the functional impact of genetic variants including missense, nonsense, synonymous, and regulatory variants for clinical variant interpretation and pathogenicity assessment.",
    "path": "skills/installed/scp/variant-functional-prediction/SKILL.md",
    "scpToolId": "201",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/variant-functional-prediction"
  },
  {
    "id": "variant-gwas-associations",
    "name": "Variant GWAS Associations",
    "description": "Query and analyze genome-wide association study (GWAS) data for genetic variants. Supports SNP-trait associations, LD proxy lookups, and PheWAS analysis.",
    "path": "skills/installed/scp/variant-gwas-associations/SKILL.md",
    "scpToolId": "variant-gwas-associations"
  },
  {
    "id": "variant-pharmacogenomics",
    "name": "variant-pharmacogenomics",
    "description": "Variant Pharmacogenomics Analysis - Analyze pharmacogenomic variants: variant effect prediction, drug response association, clinical interpretation, and dosing guidance. Use this skill for pharmacogenomics tasks involving predict variant effects associate with drug response interpret clinically guide dosing. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/variant-pharmacogenomics/SKILL.md",
    "scpToolId": "198",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/198"
  },
  {
    "id": "variant-population-frequency",
    "name": "variant-population-frequency",
    "description": "Retrieve population frequency data for genetic variants from gnoMAD and other population databases.",
    "path": "skills/installed/scp/variant-population-frequency/SKILL.md",
    "scpToolId": "199",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/199"
  },
  {
    "id": "variant_pathogenicity",
    "name": "variant_pathogenicity",
    "description": "Variant Pathogenicity Prediction - Predict variant pathogenicity: deleteriousness scoring, conservation analysis, clinical interpretation, and disease association. Use this skill for clinical genetics tasks involving score deleteriousness analyze conservation interpret clinically associate with disease. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/variant_pathogenicity/SKILL.md",
    "scpToolId": "200",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/200"
  },
  {
    "id": "virus_genomics",
    "name": "virus_genomics",
    "description": "Virus Genomics Analysis - Analyze virus genomics: genome annotation,变异分析, host interaction prediction, and therapeutic target identification. Use this skill for virology tasks involving annotate genome analyze variants predict host interactions identify targets. Combines 4 tools from 2 SCP server(s).",
    "path": "skills/installed/scp/virus_genomics/SKILL.md",
    "scpToolId": "202",
    "scpHubUrl": "https://scphub.intern-ai.org.cn/skill/202"
  }
] satisfies ScpMarkdownSkill[];
