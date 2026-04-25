# 细胞数据分析复现任务清单（期刊影响因子≥10）

## 一、IF 梯度划分

| 梯度 | IF 范围 | 代表期刊 |
|---|---:|---|
| **S+ 梯队** | **IF ≥40** | Nature Medicine 50.0、Nature 48.5、Science 45.8、Cancer Cell 44.5、Cell 42.5、Nature Biotechnology 41.7 |
| **S 梯队** | **30≤IF<40** | Nature Methods 32.1、Cell Metabolism 30.9 |
| **A 梯队** | **20≤IF<30** | Nature Genetics 29.0、Nature Cancer 28.5、Nature Immunology 27.6、Nature Biomedical Engineering 26.6、Cell Stem Cell 20.4、Nature Neuroscience 20.0 |
| **B 梯队** | **10≤IF<20** | Nature Cell Biology 19.1、Cell Host & Microbe 18.7、Molecular Cell 16.6、Nature Communications 15.7、Neuron 约15 |

## 二、细胞数据分析复现清单

### S+ 梯队：IF ≥40

| #  | 场景 | 推荐论文 | 期刊 IF | 数据类型 | Agent 复现重点 |
|---:|---|---|---:|---|---|
| 1 | 人体多器官细胞图谱构建 | **Tabula Sapiens: A multi-organ single-cell RNA-seq atlas of human organs**, *Science*, 2022 | 45.8 | 多组织 scRNA-seq | QC、整合、聚类、marker gene、细胞类型注释、跨器官细胞组成比较 |
| 2 | 跨数据集整合 / label transfer | **Comprehensive integration of single-cell data**, *Cell*, 2019 | 42.5 | scRNA-seq / scATAC / 多批次 | Seurat anchors、batch mixing、label transfer、跨模态映射 |
| 3 | RNA + 蛋白 + ATAC 多模态整合 | **Comprehensive integration of single-cell multi-omic data using neural networks**, *Cell*, 2021 | 42.5 | scRNA + ADT + scATAC | WNN 图构建、模态权重、联合 UMAP、细胞类型注释 |
| 4 | 大规模 CRISPR Perturb-seq | **Genome-scale perturb-seq analysis of the human transcriptome**, *Cell*, 2022 | 42.5 | Perturb-seq | guide assignment、扰动效应、基因模块、通路富集 |
| 5 | Perturb-seq 原始范式复现 | **Perturb-Seq: Dissecting molecular circuits with scalable single-cell RNA profiling of pooled genetic screens**, *Cell*, 2016 | 42.5 | CRISPR + scRNA-seq | sgRNA-cell 匹配、扰动 signature、遗传网络模块 |
| 6 | RNA + ATAC 同细胞联合测量 | **SHARE-seq: A highly scalable technology for single-cell RNA and chromatin accessibility profiling**, *Cell*, 2020 | 42.5 | paired scRNA + scATAC | peak-gene linkage、chromatin potential、发育方向预测、联合嵌入 |
| 7 | RNA velocity / 状态方向性 | **scVelo: A stochastic dynamical model for RNA velocity analysis of single-cell transcriptomics**, *Nature Biotechnology*, 2020 | 41.7 | spliced / unspliced scRNA-seq | velocity stream、latent time、driver genes、动态模型比较 |
| 8 | 细胞丰度变化 / differential abundance | **Milo: A tool for robust analysis of single-cell data to detect differential abundance**, *Nature Biotechnology*, 2022 | 41.7 | scRNA-seq | KNN neighborhood、DA test、FDR、疾病/扰动相关细胞状态定位 |
| 9 | scATAC 染色质可及性分析 | **Single-cell chromatin accessibility reveals principles of regulatory variation**, *Nature*, 2015 | 48.5 | scATAC-seq | peak calling、TF motif、细胞聚类、regulatory variation |
| 10 | 心脏空间生态位分析 | **Spatially resolved multiomics of human cardiac niches**, *Nature*, 2023 | 48.5 | scRNA + spatial transcriptomics | 细胞映射、心脏区域 niche、空间邻域、drug2cell 分析 |
| 11 | 疾病空间多组学：心梗 | **Spatial multi-omic map of human myocardial infarction**, *Nature*, 2022 | 48.5 | scRNA + scATAC + spatial | 病灶区域分层、免疫/纤维化程序、空间表达梯度 |
| 12 | 空间转录组高分辨定位 | **Slide-seq: A scalable method for high-resolution spatial mapping of RNA in tissue sections**, *Science*, 2019 | 45.8 | spatial transcriptomics | 空间坐标重建、空间表达图谱、组织区域 marker |
| 13 | 肿瘤免疫空间结构 | **A structured tumor-immune microenvironment in triple-negative breast cancer revealed by multiplexed imaging**, *Cell*, 2018 | 42.5 | multiplexed imaging / MIBI | 细胞分割、marker 定量、空间邻域、肿瘤-免疫结构模式 |
| 14 | 单细胞 DNA / 肿瘤克隆演化 | **Clonal evolution in breast cancer revealed by single nucleus genome sequencing**, *Nature*, 2014 | 48.5 | single-cell DNA-seq | CNV calling、克隆划分、系统发育树、肿瘤演化 |
| 15 | 肿瘤恶性细胞状态与异质性 | **Single-cell RNA-seq highlights intratumoral heterogeneity in primary glioblastoma**, *Science*, 2014 | 45.8 | tumor scRNA-seq | 恶性细胞识别、CNV 推断、肿瘤状态程序、样本内异质性 |
| 16 | TCR 克隆型与肿瘤浸润 T 细胞状态 | **Landscape of infiltrating T cells in liver cancer**, *Cell*, 2017 | 42.5 | scRNA-seq + TCR-seq | T 细胞亚群、克隆扩增、clonotype 与功能状态耦合 |
| 17 | COVID-19 免疫队列多组学 | **Single-cell multi-omics analysis of the immune response in COVID-19 patients**, *Nature Medicine*, 2021 | 50.0 | scRNA + CITE-seq + TCR/BCR | 严重度分组、细胞比例变化、DE、通路富集 |
| 18 | 免疫治疗前后纵向响应 | **A single-cell map of intratumoral changes during anti-PD1 treatment of patients with breast cancer**, *Nature Medicine*, 2021 | 50.0 | scRNA + CITE-seq + TCR | pre/on-treatment 对比、responders vs non-responders、TCR clonal expansion |
| 19 | CyTOF 单细胞蛋白状态分析 | **Single-cell mass cytometry of differential immune and drug responses across a human hematopoietic continuum**, *Science*, 2011 | 45.8 | CyTOF | gating/聚类、marker expression、药物刺激响应、造血连续谱 |
| 20 | 化学扰动单细胞转录组 | **Massively multiplex chemical transcriptomics at single-cell resolution**, *Science*, 2020 | 45.8 | chemical perturbation scRNA-seq | 药物剂量响应、扰动 embedding、机制聚类、细胞系差异 |
| 21 | 单细胞 eQTL / 遗传变异调控 | **Single-cell eQTL mapping identifies cell type-specific genetic control of autoimmune disease**, *Science*, 2022 | 45.8 | scRNA + genotype | pseudobulk、cell-type eQTL、GWAS colocalization、疾病风险解释 |
| 22 | 单细胞甲基化与神经元亚型 | **Single-cell methylomes identify neuronal subtypes and regulatory elements in mammalian cortex**, *Science*, 2017 | 45.8 | single-cell methylome | methylation clustering、DMR、调控元件、神经元亚型 |
| 23 | 细胞图谱 foundation model / 相似细胞检索 | **A cell atlas foundation model for scalable search of similar human cells**, *Nature*, 2025 | 48.5 | large-scale cell atlas | embedding search、query-to-atlas mapping、相似细胞检索、跨疾病迁移 |
| 24 | 基因网络 foundation model | **Geneformer enables large-scale prediction of gene regulatory networks**, *Nature*, 2023 | 48.5 | 大规模 scRNA 预训练 | perturbation prediction、gene network inference、disease-relevant cell-state prediction；Geneformer 在约 3000 万单细胞转录组上预训练 |

### S 梯队：30≤IF<40

| #  | 场景 | 推荐论文 | 期刊 IF | 数据类型 | Agent 复现重点 |
|---:|---|---|---:|---|---|
| 25 | 细胞类型特异性可变剪接与遗传风险 | **Single-cell RNA sequencing links cell-type-specific alternative splicing to genetic risk of complex diseases**, *Nature Genetics*, 2024 | 29.0 | scRNA + splicing + genotype | junction/isoform quantification、cell-type-specific splicing、sex/ancestry bias、疾病风险关联 |
| 26 | 三维空间肿瘤微环境 | **Highly multiplexed imaging of tumor tissues with subcellular resolution by mass cytometry**, *Nature Cancer*, 2022 | 28.5 | 3D imaging mass cytometry | 3D cell segmentation、空间邻域、肿瘤架构、免疫浸润模式 |
| 27 | 神经类器官图谱与保真度评估 | **An integrated transcriptomic cell atlas of human neural organoids**, *Nature*, 2024 | 48.5 | organoid scRNA-seq | organoid-to-reference mapping、protocol 差异、细胞类型覆盖度、成熟度/保真度评分；该研究整合 36 个数据集、超过 170 万细胞 |
| 28 | 免疫细胞状态与肿瘤治疗响应 | 代表性 **Cancer Cell** / **Nature Medicine** 免疫治疗单细胞论文 | Cancer Cell 44.5 / Nature Medicine 50.0 | tumor scRNA + immune profiling | responder/non-responder 比较、T cell exhaustion、myeloid state、clonal expansion |
| 29 | 代谢状态与细胞状态耦合 | 选择 **Cell Metabolism** 中带单细胞/空间代谢组学的数据论文 | 30.9 | scRNA / spatial / metabolomics | 代谢通路打分、细胞状态分层、疾病/营养状态比较 |

---

## 三、优先级复现任务

### 第一优先级：最适合做 agent benchmark

| 场景 | 推荐论文 |
|---|---|
| 标准 scRNA 图谱构建 | **Tabula Sapiens: A multi-organ single-cell RNA-seq atlas of human organs**, *Science* |
| 跨数据集整合 | **Comprehensive integration of single-cell data**, *Cell* |
| 细胞通讯 | **CellChat: Identifying cell-to-cell communication networks from single-cell transcriptomic data**, *Nature Communications* |
| differential abundance | **Milo: A tool for robust analysis of single-cell data to detect differential abundance**, *Nature Biotechnology* |
| RNA velocity | **scVelo: A stochastic dynamical model for RNA velocity analysis of single-cell transcriptomics**, *Nature Biotechnology* |
| 基因调控网络 | **SCENIC: Single-cell regulatory network inference**, *Nature Methods* |
| CITE-seq 联合建模 | **totalVI: Integrating transcriptome and protein expression in single cells**, *Nature Methods* |
| Perturb-seq | **Perturb-Seq: Dissecting molecular circuits with scalable single-cell RNA profiling of pooled genetic screens**, *Cell* |

### 第二优先级：体现 agent 跨工具调度能力

| 场景 | 推荐论文 |
|---|---|
| scRNA + scATAC | **SHARE-seq: A highly scalable technology for single-cell RNA and chromatin accessibility profiling**, *Cell* |
| unpaired multi-omics | **GLUE: A unified computational framework for single-cell data integration with optimal transport**, *Nature Biotechnology* |
| spatial transcriptomics | **Spatially resolved multiomics of human cardiac niches**, *Nature* |
| imaging mass cytometry | **Highly multiplexed imaging of tumor tissues with subcellular resolution by mass cytometry**, *Nature Communications* |
| Cell Painting | **Cell Painting: A phenotypic profiling technique**, *Nature Methods* |
| CyTOF | **Single-cell mass cytometry of differential immune and drug responses across a human hematopoietic continuum**, *Science* |

### 第三优先级：研究级高难复现

| 场景 | 推荐论文 |
|---|---|
| 单细胞 eQTL | **Single-cell eQTL mapping identifies cell type-specific genetic control of autoimmune disease**, *Science* |
| 单细胞甲基化 | **Single-cell methylomes identify neuronal subtypes and regulatory elements in mammalian cortex**, *Science* |
| 单细胞 DNA 克隆演化 | **Clonal evolution in breast cancer revealed by single nucleus genome sequencing**, *Nature* |
| 免疫治疗纵向队列 | **A single-cell map of intratumoral changes during anti-PD1 treatment of patients with breast cancer**, *Nature Medicine* |
| 大规模 foundation model | **Geneformer enables large-scale prediction of gene regulatory networks**, *Nature* |
| 类器官参考图谱映射 | **An integrated transcriptomic cell atlas of human neural organoids**, *Nature* |

## 四、复现任务分类

| 大类 | 对应场景 |
|---|---|
| **基础 scRNA 分析** | QC、normalization、clustering、marker、annotation |
| **整合与映射** | Seurat、Harmony、scVI、WNN、GLUE、MaxFuse |
| **动态与轨迹** | pseudotime、RNA velocity、chromatin potential |
| **调控与通讯** | SCENIC、CellChat、peak-gene linkage |
| **免疫与肿瘤** | TCR/BCR、免疫治疗响应、肿瘤微环境 |
| **扰动分析** | Perturb-seq、CROP-seq、sci-Plex、scGen |
| **空间与成像** | spatial transcriptomics、MIBI、IMC、Cell Painting |
| **遗传与表观遗传** | scATAC、scDNA、single-cell methylome、eQTL、splicing QTL |