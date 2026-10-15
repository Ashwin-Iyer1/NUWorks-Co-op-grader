#!/usr/bin/env python3
"""Write 144 original fictional job descriptions spanning 24 academic domains.

Job requirements are independently authored, not assembled from resume facts.
These are evaluation/training scenarios, not advertised vacancies. Each role is
an independent scenario with a frozen split; no job is copied across splits.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from prepare_diverse_resumes import DOMAINS

VERSION = "major-agnostic-jobs-v1"

# title | work to perform | evidence required | useful but optional experience
# Role text deliberately avoids the resume projects' exact task/deliverable pairs.
ROLES = {
    "Computer Science": """
Backend quality intern|Exercise service endpoints, diagnose malformed input, and turn defects into automated checks|programming fundamentals and ability to write reproducible test cases|Python or Java and familiarity with version control
Junior software developer|Maintain an internal workflow application, review changes, and investigate support issues|working code samples, basic database queries, and debugging experience|web frameworks and deployment automation
Infrastructure support intern|Help maintain user devices and investigate connectivity and account problems|structured troubleshooting and clear service notes|Linux commands, networking concepts, or scripting
Junior data integration developer|Move records between systems while detecting duplicates and failed transformations|SQL, a scripting language, and understanding of validation checks|scheduled data pipelines or cloud storage
Product analytics intern|Instrument user journeys and explain discrepancies in application event counts|basic statistics and ability to inspect structured data|SQL, event tracking, or dashboard software
Accessibility software tester|Evaluate digital workflows with assistive navigation and document actionable defects|accessibility fundamentals and experience testing interactive software|HTML semantics and browser developer tools
""",
    "Mechanical Engineering": """
Mechanical prototype intern|Build and inspect trial assemblies and record changes requested by the design team|ability to read mechanical drawings and safely use measurement tools|parametric modeling or workshop experience
Junior manufacturing engineer|Investigate assembly defects and update controlled work instructions|mechanical reasoning, dimensional inspection, and organized technical records|tolerance analysis or process improvement
Energy systems intern|Analyze thermal equipment measurements and compare actual behavior with calculations|thermodynamics coursework and spreadsheet analysis|instrumentation or thermal modeling
Test development engineer|Develop repeatable qualification procedures for moving hardware|mechanical testing, interpreting sensor output, and identifying sources of uncertainty|data acquisition software or fixture design
Reliability analysis intern|Classify equipment failures and investigate maintenance histories|engineering fundamentals and basic statistical reasoning|failure analysis or experience with rotating equipment
Junior product design engineer|Revise components to satisfy dimensional and manufacturing constraints|a mechanical design portfolio and familiarity with material selection|finite element methods or additive manufacturing
""",
    "Electrical Engineering": """
Circuit validation intern|Measure board behavior and help isolate discrepancies from the circuit design|circuit analysis and safe bench measurement practice|oscilloscope operation or soldering
Embedded firmware engineer|Write device drivers and investigate intermittent sensor communication failures|C programming and experience interfacing with digital hardware|SPI, I2C, or low-power modes
Power systems intern|Support load calculations and review electrical equipment schedules|basic electrical power concepts and organized calculation records|single-line diagrams or simulation software
Junior electronics designer|Prepare schematics and check component selection against operating constraints|analog and digital circuit fundamentals and schematic design experience|PCB layout or electromagnetic compatibility
Controls development intern|Compare commanded and measured motion and tune a supervised experimental setup|signals or controls coursework and numerical data analysis|MATLAB, feedback systems, or microcontrollers
RF test technician|Execute documented radio measurements and identify inconsistent results|measurement discipline, basic electronics, and clear technical reporting|antennas, spectrum analyzers, or RF coursework
""",
    "Civil Engineering": """
Construction field intern|Record site progress, interpret plans, and support inspection documentation|engineering drawing literacy and accurate field notes|surveying or construction coursework
Junior transportation analyst|Analyze travel counts and present practical changes to street operations|spreadsheet analysis and ability to interpret maps|GIS or transportation planning
Geotechnical laboratory intern|Prepare soil specimens and record supervised index-property tests|laboratory safety, careful measurement, and consistent recordkeeping|soil mechanics or materials testing
Graduate structural designer|Prepare preliminary member calculations for review by a licensed engineer|structural mechanics and ability to produce checkable design calculations|structural analysis software or drafting
Water infrastructure intern|Review utility records and assist with hydraulic network calculations|fluid mechanics fundamentals and data organization|CAD, GIS, or water quality coursework
Construction estimating assistant|Extract quantities from plans and document assumptions for bid reviews|drawing interpretation and detailed spreadsheet work|cost estimating tools or construction site experience
""",
    "Chemical Engineering": """
Process development intern|Run supervised trials and reconcile input materials with measured outputs|mass balance calculations and disciplined laboratory records|process simulation or chemical analysis
Junior process engineer|Evaluate operating data and recommend changes through a formal review process|transport phenomena, energy balances, and technical documentation|process flow diagrams or manufacturing experience
Formulation laboratory intern|Prepare small batches and measure changes in physical properties|safe chemical handling and experience following experimental procedures|polymers, mixing, or analytical instrumentation
Biomanufacturing associate|Follow controlled batch instructions and investigate deviations with the quality team|aseptic practice, accurate batch records, and understanding of contamination control|bioprocessing or regulated manufacturing
Separation technology intern|Compare candidate purification conditions using laboratory observations|separations coursework and basic data fitting|chromatography, membrane systems, or distillation
Process safety assistant|Organize equipment information and document hazards identified in supervised reviews|chemical process literacy and careful technical writing|hazard analysis or industrial safety coursework
""",
    "Biology": """
Ecology field intern|Conduct standardized species observations and maintain sampling metadata|field observation skills and accurate organism records|GIS, ecological statistics, or specimen identification
Laboratory research technician|Maintain biological materials, execute documented assays, and report unexpected results|pipetting, laboratory notebooks, and contamination prevention|molecular biology methods or cell culture
Wildlife program intern|Compile habitat observations and support community conservation activities|basic ecology and clear communication with volunteers|field identification or mapping
Genomics research assistant|Prepare experimental records and assess sequence analysis outputs|genetics fundamentals and quantitative data handling|PCR, bioinformatics, or scripting
Plant science intern|Maintain experimental plants and record treatment responses consistently|plant biology and willingness to follow repeatable measurement protocols|greenhouse experience or statistics
Biological imaging technician|Prepare image datasets and assess measurement consistency across samples|microscopy familiarity and careful data annotation|image analysis software or cell biology
""",
    "Chemistry": """
Analytical chemistry intern|Prepare reference solutions and check instrument output against controls|dilution calculations, laboratory safety, and careful documentation|spectroscopy or chromatography
Quality control chemist|Perform approved assays and investigate results outside acceptance criteria|analytical methods, calibration practice, and traceable laboratory records|HPLC, GC, or quality systems
Materials synthesis intern|Support small-scale preparations and compare composition with target properties|organic or inorganic laboratory coursework and chemical handling skills|spectral interpretation or synthesis experience
Environmental laboratory analyst|Process submitted samples and calculate reportable concentrations|sample preparation, quantitative analysis, and quality control checks|water testing or instrumental analysis
Electrochemistry intern|Collect potential and current measurements under controlled conditions|physical chemistry fundamentals and numerical analysis|electrochemical cells or instrument programming
Laboratory method development assistant|Assess assay precision and document changes to a supervised procedure|experimental design and ability to distinguish signal from measurement error|statistical software or spectroscopy
""",
    "Environmental Science": """
Environmental monitoring intern|Collect site observations and organize records for environmental assessments|field documentation and foundational environmental science|GIS, water sampling, or ecological surveys
Sustainability program coordinator|Track operational resource use and coordinate practical reduction projects|spreadsheet analysis, project organization, and written communication|energy, materials, or waste management experience
Habitat restoration intern|Monitor treatment plots and help identify barriers to plant establishment|field observation and ecological principles|native plant identification or restoration work
Junior environmental analyst|Summarize environmental datasets and explain measurement limitations to clients|quantitative analysis and technical report writing|GIS, chemistry, or environmental assessment
Climate adaptation research intern|Compare local climate exposure and summarize evidence for community planning|research methods and ability to interpret maps or datasets|climate science, planning, or community engagement
Environmental compliance assistant|Maintain inspection records and check documentation against supplied requirements|careful document review and organized records management|environmental regulations coursework or industrial site experience
""",
    "Physics": """
Optical systems intern|Characterize detector response and document alignment-sensitive measurements|optics fundamentals and experimental uncertainty analysis|optical hardware or scientific programming
Scientific instrumentation technician|Maintain a measurement setup and distinguish instrument faults from physical effects|electronics or experimental physics and methodical troubleshooting|data acquisition, vacuum systems, or sensors
Computational science intern|Implement a small physical model and compare predictions with known limiting cases|programming and numerical reasoning grounded in physics|Python, MATLAB, or differential equations
Junior signal processing analyst|Extract useful features from noisy measurement streams and explain validation results|Fourier analysis, basic statistics, and programming|acoustics, communications, or digital filtering
Materials characterization intern|Support controlled physical measurements and compare repeatability across specimens|laboratory practice and basic material properties|electrical, optical, or mechanical characterization
Technical software validation analyst|Check scientific calculations and investigate numerical inconsistencies|quantitative problem solving and ability to develop computational checks|physics, mathematics, or engineering project experience
""",
    "Mathematics": """
Operations analytics intern|Translate scheduling needs into constraints and evaluate feasible alternatives|quantitative modeling and spreadsheet or programming skills|optimization or simulation coursework
Actuarial analyst|Analyze risk data and communicate the assumptions behind financial estimates|probability, statistics, and accurate quantitative reporting|actuarial exam progress or insurance exposure
Research computing intern|Investigate numerical convergence and compare algorithms on controlled inputs|numerical analysis and programming|linear algebra or differential equations
Junior forecasting analyst|Build reproducible forecasts and evaluate errors on unseen observations|statistics, data preparation, and validation methods|R, Python, or time-series coursework
Public data analysis intern|Check definitions in public tables and summarize patterns without overstating conclusions|statistical reasoning and clear explanatory writing|SQL, data visualization, or social science research
Optimization analyst|Implement small allocation models and explain tradeoffs to operational teams|linear algebra, mathematical modeling, and basic coding|operations research or supply chain exposure
""",
    "Accounting": """
Accounting operations intern|Verify transaction support and assist with routine ledger reconciliation|introductory accounting and reliable spreadsheet work|bookkeeping systems or office experience
Staff accountant|Prepare account reconciliations and document adjustments for review|double-entry accounting and experience tracing transactions to supporting records|month-end close or accounting software
Audit support intern|Organize client evidence and document the results of supervised testing|accounting fundamentals and attention to inconsistencies|internal controls or audit coursework
Grants finance assistant|Track allowable project expenses and reconcile reports with approved budgets|financial recordkeeping and ability to follow written funding conditions|nonprofit accounting or budget analysis
Tax preparation intern|Organize financial documents and check calculations in supervised practice returns|basic accounting, confidentiality, and accurate data entry|tax coursework or spreadsheet formulas
Accounts payable specialist|Investigate invoice differences and maintain a traceable approval record|invoice processing, reconciliation, and vendor communication|purchase order systems or bookkeeping experience
""",
    "Finance": """
Financial planning intern|Maintain forecast inputs and explain changes in actual versus planned results|financial statement literacy and spreadsheet analysis|budgeting or financial modeling
Credit analyst|Review repayment evidence and summarize financial risks for a lending team|financial analysis and ability to write a supported recommendation|banking, accounting, or credit experience
Investment research intern|Collect public company information and compare business performance measures|research skills and basic corporate finance|valuation models or investments coursework
Treasury operations analyst|Monitor cash positions and investigate settlement discrepancies|cash flow understanding, reconciliation, and organized records|banking systems or Excel modeling
Project finance intern|Compare investment alternatives under explicit cost and revenue assumptions|time-value-of-money calculations and sensitivity analysis|infrastructure, energy, or business planning
Junior financial analyst|Develop a transparent operating model and discuss the consequences of uncertain inputs|spreadsheet modeling and quantitative reasoning|economics, accounting, mathematics, or relevant project work
""",
    "Marketing": """
Audience research intern|Prepare research materials and summarize customer feedback for product teams|interview or survey fundamentals and clear synthesis|qualitative coding or consumer behavior
Marketing operations coordinator|Maintain campaign schedules and verify performance reporting inputs|organization, spreadsheet skills, and concise business writing|email platforms or customer relationship systems
Content marketing intern|Draft useful audience-focused materials and revise them using editorial feedback|strong writing samples and ability to adapt tone to readers|content calendars, SEO, or social analytics
Junior market research analyst|Clean survey responses and distinguish useful findings from sampling artifacts|research design and basic statistical interpretation|SPSS, R, or consumer research
Brand strategy intern|Compare competitor messages and prepare positioning options supported by evidence|research, presentation, and analytical writing|visual communication or branding projects
Digital campaign analyst|Evaluate channel performance and recommend measurable experiments|data analysis and understanding of marketing measurement|web analytics, SQL, or controlled testing
""",
    "Supply Chain Management": """
Purchasing intern|Update supplier information and investigate missing purchase-order details|organized records and professional written communication|Excel, procurement, or business coursework
Inventory analyst|Compare demand and stock records to recommend replenishment changes|spreadsheet analysis and understanding of inventory tradeoffs|forecasting, SQL, or distribution experience
Distribution operations intern|Observe fulfillment processes and record delays at handoff points|process observation and accurate quantitative notes|warehouse work or process mapping
Logistics coordinator|Resolve shipment exceptions and maintain reliable delivery status information|scheduling, records management, and cross-team communication|transportation systems or customer support
Supply planning intern|Evaluate capacity assumptions and organize data for production planning|quantitative reasoning and spreadsheet skills|operations research, manufacturing, or supply chain coursework
Procurement analyst|Compare supplier performance and document evidence for purchasing decisions|data cleaning, cost comparison, and clear reporting|contract administration or supplier management
""",
    "Psychology": """
Behavioral research intern|Assist with study sessions and check that collected data follow the research protocol|research ethics and basic experimental methods|statistics, participant coordination, or psychology coursework
User research coordinator|Schedule study activities and synthesize observations from product users|interviewing, organized records, and evidence-based writing|usability studies or qualitative analysis
Human resources research intern|Summarize employee feedback and maintain anonymized analysis files|survey methods and confidentiality-aware data handling|organizational psychology or spreadsheets
Community program evaluator|Assess whether service activities support stated program goals|basic statistics, research methods, and clear reporting|social services, surveys, or evaluation experience
Learning research intern|Observe study activities and code performance using a provided scheme|consistent behavioral observation and careful documentation|cognitive science, education, or data analysis
Clinical research coordinator assistant|Maintain study documentation and coordinate participant visits under a supervisor|research ethics, scheduling, and accurate records|health research or participant-facing experience; no clinical license required for this administrative role
""",
    "Sociology": """
Community research intern|Organize field notes and identify patterns in service access|qualitative research and respectful participant communication|GIS, public data, or social research
Program operations coordinator|Manage volunteer information and prepare concise service activity reports|coordination, accurate records, and clear communication|nonprofit programs or spreadsheet analysis
Social policy research intern|Compare published evidence about local service needs|source evaluation and analytical writing|statistics, policy coursework, or literature reviews
Junior survey analyst|Check questionnaire logic and summarize response quality|survey methods and quantitative reasoning|R, SPSS, or research fieldwork
Community engagement intern|Support consultation events and document differing stakeholder views|listening, note-taking, and event organization|facilitation or community-based experience
Housing services program assistant|Explain supplied program information and maintain referral records|plain-language communication and careful administrative work|social services, public administration, or customer support
""",
    "Political Science": """
Policy research intern|Review proposed policy changes and summarize relevant evidence|research, source citation, and concise analytical writing|government processes or public policy coursework
Legislative operations assistant|Track correspondence and prepare briefings from public documents|document management and accurate summarization|civic organizations or administrative experience
Government relations intern|Monitor public consultations and map relevant stakeholder positions|research skills and clear professional communication|political institutions or issue advocacy
Public program analyst|Compare implementation records with a program's stated objectives|evidence evaluation and basic quantitative analysis|economics, sociology, political science, or program operations
International affairs research intern|Build a sourced comparison of policies across countries|comparative research and ability to distinguish primary from secondary evidence|language study or regional expertise
Civic education coordinator|Prepare nonpartisan learning activities and coordinate public workshops|public communication, event organization, and careful factual checking|teaching, history, communications, or civic engagement
""",
    "English": """
Editorial production intern|Check copy for consistency and coordinate revisions across contributors|strong proofreading and ability to follow a style guide|publishing, student media, or content production
Junior technical writer|Interview subject experts and turn complex procedures into usable documentation|clear explanatory writing and ability to verify instructions|software tools, Markdown, or usability testing
Development communications intern|Draft donor-facing program updates using verified organizational evidence|persuasive writing and careful source handling|nonprofit experience or grant research
Content designer|Improve interface messages and test whether readers understand required actions|plain-language writing and audience-centered revision|user research, accessibility, or interaction design
Publishing research intern|Fact-check manuscripts and maintain a source record for editorial decisions|research, citation management, and close reading|literature, history, or journalism coursework
Communications coordinator|Maintain a publication schedule and adapt accurate messages for different audiences|writing samples, editing, and project coordination|internal communications, education, or community programs
""",
    "History": """
Archives processing intern|Organize documentary collections and describe their contents consistently|research habits and accurate descriptive records|archival methods or cataloging
Museum interpretation assistant|Develop public-facing explanations from primary and secondary evidence|source criticism and accessible writing|public history, education, or museum experience
Historical research intern|Trace changes over time and document conflicting evidence|primary-source analysis and citation practices|digital research tools or oral history
Records management assistant|Classify organizational records and maintain reliable retrieval information|systematic document handling and attention to provenance|archives, administration, or information management
Heritage engagement intern|Help prepare learning activities and coordinate visitor feedback|public communication and historical research|teaching, tourism, or community engagement
Research and due-diligence assistant|Construct sourced timelines and distinguish confirmed facts from uncertain reports|document research and precise analytical writing|history, journalism, policy, or legal research exposure
""",
    "Graphic Design": """
Visual communications intern|Prepare layouts and revise design files against editorial and production feedback|a portfolio showing typography and visual hierarchy|Illustrator, InDesign, or print production
Junior interface designer|Create interactive prototypes and explain design decisions based on user needs|portfolio evidence of interaction design and iterative revision|Figma, usability research, or accessibility
Brand studio intern|Develop visual options and organize assets for consistent reuse|composition, vector drawing, and attention to production details|identity systems or motion graphics
Publication designer|Build readable page systems and prepare final files for delivery|layout design, typography, and production-file checks|InDesign or editorial collaboration
Information design intern|Translate complex material into understandable visual explanations|visual hierarchy and ability to check the accuracy of graphics|data visualization or instructional materials
Junior motion designer|Develop short animated pieces and incorporate timing and narrative feedback|a motion portfolio and familiarity with digital animation workflows|After Effects, storyboarding, or sound editing
""",
    "Music": """
Audio production intern|Prepare recording sessions and edit spoken or musical material for review|basic signal flow and familiarity with an audio workstation|microphones, editing, or ensemble recording
Arts program coordinator|Manage rehearsal information and communicate production changes to participants|scheduling, clear communication, and performing-arts familiarity|music literacy or event operations
Music education intern|Assist an instructor with practice activities and record student progress|music fundamentals and patient learner support|instrument instruction or youth programs
Junior sound editor|Clean dialogue, organize sessions, and produce consistent audio deliverables|audio editing experience and careful listening|Reaper, Pro Tools, or podcast production
Music collections intern|Describe scores and recordings using consistent cataloging information|score reading and accurate research records|library systems or music history
Production technician|Set up live audio equipment and troubleshoot signal paths under venue procedures|hands-on cabling and mixing experience and reliable technical communication|live events, theatre, or recording experience
""",
    "Education": """
Learning support intern|Prepare instructional materials and observe how learners respond to activities|clear explanations, organization, and willingness to accept teacher feedback|tutoring, youth work, or learning theory
Instructional materials assistant|Adapt educational content and check whether instructions support learning goals|writing, structured lesson planning, and attention to accessibility|education, English, design, or training experience
Youth enrichment intern|Help deliver supervised activities and maintain participation records|facilitation and experience working responsibly with groups|science outreach, arts programs, or tutoring
Elementary classroom teacher|Plan instruction, assess progress, and coordinate support with families|a current teaching credential for the assigned classroom and supervised teaching experience|literacy instruction or differentiated learning
Educational technology intern|Test digital activities and help educators resolve content-access problems|basic technology troubleshooting and learner-focused communication|learning platforms, captions, or accessible document design
Training coordinator|Organize staff learning sessions and revise materials from participant feedback|instructional communication and program coordination|adult learning, subject tutoring, or workplace training
""",
    "Nursing": """
Student nurse intern|Support a licensed nurse during supervised learning activities and document approved observations|current enrollment in an accredited nursing program and completion of nursing fundamentals|supervised clinical placement or patient communication practice
Registered nurse - ambulatory care|Provide nursing care, document assessments, and coordinate follow-up under clinic procedures|a current Registered Nurse license and demonstrated clinical assessment skills|ambulatory care or patient education
Nursing simulation intern|Prepare supervised skills exercises and organize learner feedback|nursing coursework and careful use of simulation records|clinical communication or skills-laboratory experience
Registered nurse - care coordination|Review patient care needs and coordinate transitions with the clinical team|a current Registered Nurse license and experience documenting clinical care|case coordination or health education
Nursing quality intern|Organize de-identified improvement records and assist with supervised clinical-process observations|current nursing study, basic statistics, and confidentiality-aware records handling|quality improvement or clinical placement
Registered nurse - staff education|Support clinical skills development and evaluate practice under an education lead|a current Registered Nurse license, clinical nursing experience, and clear instructional communication|graduate nursing study or teaching experience
""",
    "Public Health": """
Population health intern|Organize community health data and summarize patterns for a supervised project|basic statistics and careful handling of de-identified information|epidemiology, sociology, or health research
Health education coordinator|Develop understandable outreach materials and coordinate community sessions|health communication, program organization, and evidence-based writing|public health, education, or community services
Epidemiology research intern|Check dataset definitions and assist with descriptive analyses|statistical reasoning and understanding of study design|R, SAS, or quantitative coursework
Public health program analyst|Assess program measures and identify gaps between activities and intended outcomes|evaluation methods, data interpretation, and concise reporting|public health, policy, or social science research
Environmental health intern|Compile exposure observations and document sampling limitations|environmental science fundamentals and quantitative records|GIS, chemistry, or field data collection
Community health navigator|Explain available services and coordinate referrals using supplied eligibility guidance|respectful communication, accurate documentation, and resource research|community work, social services, or public health; no nursing license required
""",
}


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_jobs() -> list[dict]:
    if set(ROLES) != set(DOMAINS):
        raise ValueError("Job domains must match the resume coverage")
    jobs = []
    for major, raw in ROLES.items():
        records = [line.split("|") for line in raw.strip().splitlines()]
        if len(records) != 6 or any(len(parts) != 4 for parts in records):
            raise ValueError(f"Invalid job scenarios for {major}")
        rotation = int(digest("jobs|" + major)[:8], 16) % 6
        for index, (title, work, required, preferred) in enumerate(records):
            slot = (index + rotation) % 6
            split = "test" if slot == 0 else "val" if slot == 1 else "train"
            seniority = "internship" if index % 2 == 0 else "entry_level"
            introduction = (
                "A supervised placement with feedback from a designated project lead. Coursework, community work, and personal projects can demonstrate the requested skills."
                if seniority == "internship" else
                "An early-career position with responsibility for assigned work and review from an experienced colleague. Relevant evidence may come from employment, placements, or substantial projects."
            )
            # No exact major gate: labels must distinguish demonstrated capability
            # from the academic domain used only for balanced sampling metadata.
            gate = ("A specific college major is not required; assess the stated skills and qualifications. "
                    "Preferred experience is optional.")
            if major == "Nursing":
                gate = "The nursing enrollment or license requirement above is mandatory. Preferred experience is optional."
            elif title == "Elementary classroom teacher":
                gate = "The stated teaching credential is mandatory. Preferred experience is optional."
            blocks = [introduction, f"Responsibilities: {work}.", f"Required qualifications: {required}.", f"Preferred: {preferred}.", gate]
            if index % 3 == 1:
                blocks = [blocks[1], blocks[2], blocks[0], blocks[3], blocks[4]]
            elif index % 3 == 2:
                blocks = [blocks[0], blocks[2], blocks[3], blocks[1], blocks[4]]
            text = "\n\n".join(blocks)
            raw_id = "fictional-" + digest(title + "|" + text)[:16]
            jobs.append({
                "job_id": raw_id, "title": title, "job_desc": text,
                "split": split, "major": major, "seniority": seniority,
                "family_id": "job-family-" + digest(major + "|" + title)[:16],
                "source": "independently_authored_fictional", "version": VERSION,
            })
    return jobs


def write_jobs(out_dir: Path) -> dict:
    jobs = build_jobs()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "jobs.json").write_text(json.dumps(jobs, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "version": VERSION, "source": "independently_authored_fictional",
        "advertised_real_vacancies": False, "jobs": len(jobs),
        "majors": len(ROLES), "split_counts": dict(sorted(Counter(job["split"] for job in jobs).items())),
        "seniority_counts": dict(sorted(Counter(job["seniority"] for job in jobs).items())),
        "family_rule": "Each role is a distinct authored scenario, four train/one val/one test per major; never duplicate jobs across splits.",
        "labeling_rule": "major is sampling metadata, not a fit label; credit equivalent evidence and enforce only explicitly required credentials.",
        "corpus_sha256": digest(json.dumps(jobs, sort_keys=True)),
        "limitations": ["Synthetic requirements are not verified real vacancies.", "Related disciplinary vocabulary is shared with resumes, but responsibilities were authored independently.", "Job and resume holdouts must remain disjoint from training; evaluate real held-out datasets separately."],
    }
    (out_dir / "jobs_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, default=Path("data/major_agnostic"))
    args = parser.parse_args()
    manifest = write_jobs(args.out_dir)
    print(f"Wrote {manifest['jobs']} original fictional job descriptions to {args.out_dir / 'jobs.json'}")
    print(json.dumps(manifest["split_counts"], sort_keys=True))


if __name__ == "__main__":
    main()
