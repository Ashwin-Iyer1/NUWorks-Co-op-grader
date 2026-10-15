// Original fictional fixtures. No scraped postings or student data.
export const profiles = [
  {
    id: "engineering", name: "Software engineering", focus: "Build & ship",
    text: `Computer science student seeking a software engineering co-op.
Built a React and TypeScript dashboard with accessible components and REST API integration. Developed Python and FastAPI services backed by PostgreSQL and SQL. Used Git, Docker, Linux, and pytest for testing and deployment.
Projects: designed a data visualization tool, implemented unit testing, and collaborated through code reviews. Experience debugging application performance and documenting APIs. Coursework in algorithms, data structures, statistics, and software engineering.`,
  },
  {
    id: "markets", name: "Data & financial research", focus: "Model & investigate",
    text: `Computer science and finance student seeking a quantitative research or data analysis co-op.
Built Python notebooks for portfolio management, risk management, and financial analysis using pandas, numpy, SQL, and statistics. Studied regression, derivatives, and equity research. Created Excel models for valuation and financial modeling.
Projects: analyzed historical market data, built a backtesting pipeline, and communicated research through data visualization. Used Git and pytest to validate data transformations. Coursework in probability, accounting, and capital markets.`,
  },
  {
    id: "product", name: "Product & design", focus: "Understand & create",
    text: `Design and business student seeking a product design or product analytics co-op.
Conducted user research and usability testing to improve a student scheduling app. Designed accessible prototypes in Figma and documented interaction patterns. Experience with UX research, product management, and project management.
Projects: ran A/B testing and market research, analyzed survey results in Excel, and communicated findings through data visualization. Built HTML and CSS prototypes. Collaborated with engineers using agile methods and worked on content strategy and digital marketing.`,
  },
];

export const jobs = [
  {
    id: "northstar-platform", company: "Northstar Studio", initials: "NS", title: "Software Engineering Co-op",
    track: "Engineering", workstyle: "Hybrid", location: "Boston, MA", hourly: 31, term: "January–June · 6 months",
    summary: "Build the services and interfaces that help a small team make sense of messy operational data.",
    description: `Help our fictional platform team ship a dashboard for operational data. Build and maintain REST API endpoints, improve data import workflows, and translate designs into accessible interfaces. You will collaborate with engineers on code reviews, write tests, and document decisions.
Required: Python, SQL, Git, and unit testing.
Preferred: TypeScript, React, FastAPI, PostgreSQL, and Docker.
You will investigate customer-reported bugs, review query performance, and help make releases easier to verify. We value clear documentation and careful debugging. This co-op offers mentorship through weekly design reviews and a scoped feature that you can own from implementation through testing.`,
  },
  {
    id: "meridian-risk", company: "Meridian Research", initials: "MR", title: "Quantitative Risk Research Co-op",
    track: "Data & finance", workstyle: "Hybrid", location: "Boston, MA", hourly: 35, term: "January–June · 6 months",
    summary: "Explore which market exposures drive portfolio risk, and make the research reproducible.",
    description: `Join a fictional investment research team studying risk across equity portfolios. Analyze historical market data, build reusable research notebooks, and investigate how factor exposures change over time. Research will support internal discussions rather than automated trading.
Required: Python, pandas, numpy, statistics, and financial analysis.
Preferred: SQL, Git, derivatives, portfolio management, and risk management.
You will document data assumptions, compare alternative model specifications, and present research with data visualization. Expect to spend time validating datasets and explaining uncertainty. Work with a mentor to produce reproducible analyses and readable code that another researcher can run.`,
  },
  {
    id: "canopy-design", company: "Canopy Collective", initials: "CC", title: "Product Design Co-op",
    track: "Product & design", workstyle: "Remote", location: "US remote", hourly: 27, term: "January–June · 6 months",
    summary: "Turn user interviews into a simpler, more accessible scheduling experience.",
    description: `Our fictional product team is redesigning a scheduling tool for community organizations. Help us understand how coordinators plan events and turn research findings into usable interface proposals. You will sketch flows, create prototypes, and test ideas with stakeholders.
Required: Figma, user research, and usability testing.
Preferred: HTML, CSS, UX research, and product management.
We are looking for thoughtful research and design decisions, clear written communication, and willingness to revise an idea after feedback. Work closely with engineers to document accessible interaction patterns. The placement includes regular critique sessions and a complete research-to-prototype project.`,
  },
  {
    id: "harbor-data", company: "Harbor Systems", initials: "HS", title: "Data Engineering Co-op",
    track: "Engineering", workstyle: "Remote", location: "US remote", hourly: 32, term: "July–December · 6 months",
    summary: "Bring dependable pipelines, clear data contracts, and useful tests to a growing analytics platform.",
    description: `Help a fictional analytics team improve the reliability of its data pipelines. Build data transformations, document source schemas, and add checks that identify missing or inconsistent records before they reach dashboards. Collaborate with analysts to understand their reporting needs.
Required: Python, SQL, and Git.
Preferred: Airflow, dbt, Snowflake, AWS, Docker, and data engineering.
You will create repeatable ETL workflows, write unit testing for transformations, and investigate pipeline failures. The team cares about understandable code and traceable data quality checks. A mentor will help you plan a small pipeline improvement and evaluate it against documented acceptance criteria.`,
  },
  {
    id: "mosaic-analytics", company: "Mosaic Labs", initials: "ML", title: "Product Analytics Co-op",
    track: "Product & design", workstyle: "Hybrid", location: "Cambridge, MA", hourly: 29, term: "January–June · 6 months",
    summary: "Connect product questions to experiments, metrics, and decisions people can explain.",
    description: `Support a fictional product team exploring how people use a learning application. Translate questions into measurable events, analyze product usage, and communicate findings to designers and engineers. Help define useful metrics and avoid drawing conclusions from small samples.
Required: SQL, statistics, and data analysis.
Preferred: Python, A/B testing, Excel, Tableau, and product management.
You will document experiment plans, investigate changes in engagement, and create data visualization for weekly reviews. We value careful interpretation over dramatic charts. Work with a mentor to understand how instrumentation choices affect analysis and how uncertainty should inform product decisions.`,
  },
  {
    id: "elm-investments", company: "Elm Financial", initials: "EF", title: "Investment Research Co-op",
    track: "Data & finance", workstyle: "On-site", location: "Boston, MA", hourly: 30, term: "July–December · 6 months",
    summary: "Build a defensible research view from financial statements, models, and careful source notes.",
    description: `Work with a fictional research group reviewing public companies and industry trends. Read financial statements, organize source materials, and build models that make their assumptions easy to inspect. Research supports team discussions and is not investment advice.
Required: Excel, financial analysis, accounting, and valuation.
Preferred: financial modeling, equity research, Bloomberg, and capital markets.
You will compare scenarios, review forecast assumptions, and present concise research summaries. We value attention to data provenance and a willingness to explain what a model cannot tell us. A mentor will review your work and help you develop a clear, repeatable research process.`,
  },
  {
    id: "fieldnote-ml", company: "Fieldnote AI", initials: "FA", title: "Machine Learning Engineering Co-op",
    track: "Engineering", workstyle: "Hybrid", location: "Cambridge, MA", hourly: 36, term: "January–June · 6 months",
    summary: "Test retrieval models against explicit evaluation cases and bring them into a usable application.",
    description: `Help a fictional team build a search tool for technical documents. Develop evaluation cases, investigate retrieval failures, and make model behavior understandable to product engineers. We care about reproducible experiments and reliable user-facing software.
Required: Python, PyTorch, machine learning, and statistics.
Preferred: natural language processing, FastAPI, Docker, Git, and model deployment.
You will compare baseline approaches, document dataset limitations, and write testing around preprocessing. Collaborate on an API integration and monitor how changes affect evaluation results. This role includes mentorship in experiment design and an opportunity to ship a carefully evaluated feature.`,
  },
  {
    id: "cedar-web", company: "Cedar Works", initials: "CW", title: "Frontend Engineering Co-op",
    track: "Engineering", workstyle: "Remote", location: "US remote", hourly: 30, term: "July–December · 6 months",
    summary: "Build interfaces that stay clear across devices, input methods, and imperfect network conditions.",
    description: `Join a fictional web team improving a community event application. Build responsive pages, refine keyboard interactions, and work with designers on accessible component patterns. You will turn requirements into small, testable changes and document the behavior of each feature.
Required: TypeScript, React, HTML, and CSS.
Preferred: Git, Playwright, Jest, and REST API.
You will investigate layout issues, add integration testing, and improve empty and loading states. The team reviews code collaboratively and treats performance and accessibility as everyday design concerns. A mentor will support a complete feature from planning through release review.`,
  },
  {
    id: "atlas-markets", company: "Atlas Market Lab", initials: "AM", title: "Market Data Research Co-op",
    track: "Data & finance", workstyle: "On-site", location: "New York, NY", hourly: 34, term: "January–June · 6 months",
    summary: "Investigate data quality and research signals before they enter a market analysis workflow.",
    description: `Support a fictional market research team analyzing historical pricing and reference data. Build scripts to find missing records, study unusual observations, and document data transformations. Work with researchers to keep analysis reproducible across changing datasets.
Required: Python, SQL, pandas, and statistics.
Preferred: numpy, Git, derivatives, and quantitative analysis.
You will compare alternative data cleaning choices, develop regression analyses, and explain findings in concise research notes. We value transparent assumptions and testing over unexplained performance claims. A mentor will help you connect sound software practices to careful analysis of financial markets.`,
  },
];
