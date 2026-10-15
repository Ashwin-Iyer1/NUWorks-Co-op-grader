#!/usr/bin/env python3
"""Build independently authored, fictional resumes with a frozen family split.

No web resume text or match labels are included. University sample catalogs
inform coverage only. Six distinct scenarios per major are expanded through six
career stages; every variant of a scenario stays in the same split. The result
is 864 documents representing 144 scenario families, NOT 864 independent people.

Usage: python prepare_diverse_resumes.py --out-dir data/major_agnostic
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

from generate_openai_labels import normalize_whitespace, redact_contact_details

VERSION = "major-agnostic-fictional-v2"
STAGES = ("first_year", "sophomore", "junior", "senior", "masters", "career_changer")
FIELDS = (
    "resume_id", "Resume_str", "Category", "major", "skill_domain", "student_year",
    "career_stage", "degree_level", "source", "profile_family", "family_id", "split",
    "scenario", "evidence_variant", "version", "text_sha256",
)

# Each record is: project | supervised role | concrete activity | deliverable | tools.
# These facts were authored for this repository, not extracted or paraphrased from
# any sample resume. Short shared subject names are ordinary curricular vocabulary.
DOMAINS = {
    "Computer Science": ("BS", "programming; discrete mathematics; algorithms", """
Library search accessibility|campus web assistant|tested keyboard navigation and corrected inaccessible search controls|an accessibility checklist with reproducible browser cases|JavaScript, HTML, accessibility testing
Dining queue telemetry|software engineering intern|instrumented queue events and traced duplicate requests|a request log dashboard and a documented retry fix|Python, SQL, HTTP
Trail map offline cache|mobile development assistant|implemented cached map tiles and tested airplane-mode routing|a small Android prototype with an offline failure report|Kotlin, SQLite, Git
Student lab device inventory|IT automation intern|matched serial numbers to device records and flagged stale assignments|an inventory reconciliation script with an exception report|PowerShell, CSV, endpoint inventory
Appointment API security|application testing intern|reproduced missing authorization checks with isolated test accounts|a regression suite for role-based appointment access|TypeScript, REST APIs, unit testing
Archive text indexing|digital collections assistant|tokenized scanned transcripts and inspected search relevance errors|a searchable text index and annotated failure cases|Python, information retrieval, regular expressions
"""),
    "Mechanical Engineering": ("BS", "statics; materials; thermodynamics", """
Adaptive jar opener|mechanical design assistant|compared handle geometries using grip force measurements|CAD drawings and a prototype assembly note|SolidWorks, calipers, design for assembly
Small heat exchanger rig|thermal lab assistant|logged inlet and outlet temperatures at several flow settings|a heat balance workbook including sensor uncertainty|thermocouples, Excel, heat transfer
Bicycle frame fatigue fixture|test engineering intern|assembled a loading fixture and checked strain gauge placement|a fixture drawing and cyclic test procedure|strain gauges, CAD, mechanical testing
Workshop compressed air audit|facilities engineering intern|mapped hose leaks and recorded compressor duty cycles|an air-use estimate and maintenance priority sheet|pressure gauges, data logging, energy balances
Conveyor bearing alignment|manufacturing engineering intern|measured shaft runout and compared alignment methods|a troubleshooting guide with dial-indicator readings|GD&T, dial indicators, root cause analysis
Assistive seat lift linkage|product development assistant|modeled linkage travel and evaluated pinch-clearance constraints|a motion study and dimensional prototype|Fusion 360, mechanisms, rapid prototyping
"""),
    "Electrical Engineering": ("BS", "circuits; signals; electronics", """
Soil moisture sensor node|embedded systems intern|calibrated sensor readings against weighed soil samples|firmware and a calibration plot with error bounds|C, microcontrollers, I2C
Audio amplifier noise study|electronics lab assistant|isolated power-supply hum with controlled grounding changes|an annotated schematic and oscilloscope captures|oscilloscope, soldering, analog circuits
Solar charging controller|power electronics assistant|measured battery charging curves under variable panel output|a controller test log and efficiency calculation|SPICE, DC circuits, multimeters
Indoor radio coverage survey|RF test intern|recorded signal strength along a repeatable floor route|a coverage map identifying low-signal locations|RF measurements, Python, antennas
Motor speed feedback bench|controls lab assistant|tuned a feedback loop and measured step-response overshoot|a controller comparison report|MATLAB, PID control, encoders
Low-power wearable PCB|hardware design intern|reviewed trace clearances and checked sleep-current consumption|a PCB revision checklist and current budget|KiCad, PCB layout, power measurement
"""),
    "Civil Engineering": ("BS", "structural analysis; surveying; fluid mechanics", """
Pedestrian crossing drainage|municipal engineering assistant|surveyed surface slopes and located recurring ponding|a drainage sketch and field measurement log|AutoCAD, leveling, hydrology
Footbridge load model|structural engineering intern|compared beam deflection estimates with a scale test|a load calculation package with assumptions|structural mechanics, Excel, CAD
Concrete recycled aggregate study|materials laboratory assistant|cast test cylinders and tracked curing conditions|a compressive-strength comparison table|concrete testing, lab records, statistics
Bus stop access survey|transportation planning intern|measured sidewalk clearances and counted pedestrian movements|an accessibility map and crossing observation summary|GIS, site surveying, spreadsheets
Construction quantity takeoff|project controls assistant|checked drawing revisions and reconciled material quantities|a takeoff workbook and change log|Bluebeam, estimating, construction drawings
Stream bank erosion assessment|water resources intern|recorded bank profiles and photographed sediment deposits|a site assessment with mapped monitoring points|QGIS, field sampling, erosion assessment
"""),
    "Chemical Engineering": ("BS", "mass balances; transport phenomena; reaction engineering", """
Fermentation yield comparison|bioprocess lab assistant|tracked substrate consumption and batch temperature variation|a yield calculation sheet and batch record|mass balances, pH meters, Excel
Solvent recovery column|process engineering intern|reconciled feed and distillate measurements across runs|a separation performance report|distillation, Aspen simulation, process diagrams
Water treatment adsorption|process research assistant|measured dye removal at different contact times|a breakthrough plot and sampling protocol|UV-visible spectroscopy, adsorption, Python
Polymer mixing trial|materials process intern|varied mixing speed and recorded viscosity changes|a mixing operating window with rejected conditions|rheology, experimental design, lab safety
Plant heat recovery assessment|energy engineering assistant|calculated recoverable heat from a simulated utility stream|a heat exchanger duty estimate and assumptions register|energy balances, process simulation, spreadsheets
Reactor residence time test|reaction engineering assistant|conducted tracer measurements on a teaching flow reactor|a residence-time distribution and uncertainty note|fluid flow, data fitting, MATLAB
"""),
    "Biology": ("BS", "cell biology; genetics; ecology", """
Wetland invertebrate survey|field biology assistant|sorted aquatic specimens and checked sampling consistency|a taxon count table and field protocol|microscopy, specimen handling, R
Plant drought response|greenhouse research assistant|measured leaf growth under controlled watering schedules|a growth dataset with treatment notes|plant care, experimental controls, Excel
Yeast stress assay|molecular biology assistant|prepared cultures and compared growth under salt stress|a plate log and growth-curve analysis|aseptic technique, pipetting, spectrophotometry
Community bird monitoring|conservation program intern|standardized observation intervals and checked species records|a seasonal sightings summary|field identification, GIS, data cleaning
PCR primer screening|genomics laboratory assistant|compared primer candidates and documented amplification controls|a primer selection memo and gel annotation|PCR, gel electrophoresis, sequence alignment
Cell image annotation|imaging research assistant|annotated cell boundaries and checked agreement between raters|a labeled image set and disagreement log|ImageJ, cell culture observations, statistics
"""),
    "Chemistry": ("BS", "organic chemistry; analytical chemistry; physical chemistry", """
Drinking water ion analysis|analytical laboratory assistant|prepared calibration standards and checked blank contamination|a concentration table with detection-limit notes|ion chromatography, dilution, quality control
Natural dye extraction|organic chemistry assistant|compared extraction solvents and tracked sample purity|a solvent comparison report and thin-layer plates|TLC, extraction, laboratory notebooks
Battery electrolyte conductivity|electrochemistry research assistant|measured conductivity over a controlled temperature range|a conductivity plot with replicate variability|electrochemistry, data fitting, instrumentation
Food preservative quantification|quality laboratory intern|prepared food extracts and inspected chromatographic peaks|an assay worksheet with recovery checks|HPLC, sample preparation, calibration
Catalyst reuse experiment|catalysis lab assistant|compared reaction conversion over repeated catalyst cycles|a reuse table and a record of failed runs|GC analysis, kinetics, chemical handling
Museum pigment identification|conservation science assistant|compared reference spectra with unknown pigment samples|a tentative identification report with limitations|FTIR, spectroscopy, reference matching
"""),
    "Environmental Science": ("BS", "ecology; environmental chemistry; GIS", """
Neighborhood heat mapping|environmental planning intern|collected shaded and exposed surface temperatures|a heat map with sampling-time caveats|GIS, field sensors, spreadsheets
Campus waste characterization|sustainability program assistant|classified waste samples and estimated contamination by stream|a waste audit and sorting-sign proposal|waste auditing, data visualization, project coordination
Stream nutrient monitoring|water quality assistant|collected duplicate samples and checked transport records|a water-quality dataset and sample custody log|field sampling, colorimetry, quality assurance
Urban tree inventory|urban ecology intern|recorded tree condition and mapped canopy gaps|a tree inventory and planting priority map|QGIS, field identification, data entry
Restoration seed trial|restoration field assistant|tracked germination on treated and untreated plots|a plot monitoring sheet and survival comparison|ecological surveys, experimental design, R
Building energy behavior study|sustainability analyst intern|compared meter trends with room occupancy schedules|an energy-use summary separating weather effects|Excel, energy auditing, descriptive statistics
"""),
    "Physics": ("BS", "classical mechanics; electromagnetism; quantum physics", """
Laser alignment stability|optics laboratory assistant|measured beam drift after controlled mount adjustments|an alignment procedure and stability plot|optical benches, photodiodes, Python
Cosmic ray coincidence detector|instrumentation assistant|checked coincidence timing and estimated accidental counts|a detector calibration report|oscilloscope, radiation detectors, statistics
Pendulum damping comparison|teaching laboratory assistant|fit oscillation envelopes for several damping materials|a reproducible fitting notebook|mechanics, curve fitting, uncertainty analysis
Thin film resistance mapping|materials physics intern|measured sheet resistance across deposited samples|a resistance map and measurement repeatability note|four-point probes, lab records, MATLAB
Telescope image calibration|astronomy research assistant|subtracted dark frames and compared photometric apertures|a calibrated image pipeline and residual plot|Python, astronomy, image processing
Acoustic room resonance survey|acoustics test assistant|recorded frequency sweeps at marked positions|a resonance map with microphone placement notes|FFT, signal processing, measurement design
"""),
    "Mathematics": ("BS", "linear algebra; probability; numerical analysis", """
Library staffing optimization|operations research assistant|formulated staffing constraints and tested feasible schedules|a small optimization model and sensitivity table|linear programming, Python, modeling
Insurance claim simulation|actuarial analyst intern|simulated claim frequency and compared reserve percentiles|a risk workbook with distribution assumptions|probability, R, simulation
Transit arrival uncertainty|data analysis assistant|compared prediction intervals against held-out arrival records|a calibration report with outlier inspection|statistics, Python, time series
Numerical heat equation solver|scientific computing assistant|checked mesh convergence and boundary conditions|a solver notebook with verification cases|numerical methods, MATLAB, differential equations
Voting rule comparison|quantitative research assistant|enumerated preference profiles and compared rule outcomes|a reproducible counterexample collection|combinatorics, Python, mathematical writing
Peer tutoring assessment|learning analytics assistant|summarized anonymized tutoring attendance and course outcomes|a descriptive report distinguishing correlation from causation|regression, Excel, data ethics
"""),
    "Accounting": ("BS", "financial accounting; managerial accounting; auditing", """
Community theater bookkeeping|bookkeeping assistant|matched ticket deposits with bank entries and flagged differences|a bank reconciliation and outstanding-items list|Excel, bank reconciliation, double-entry bookkeeping
Inventory count control review|audit intern|traced sampled stock counts to inventory records|a control walkthrough and audit workpapers|audit sampling, internal controls, spreadsheets
Student organization budget|finance office assistant|categorized expenses and compared requests with the approved budget|a monthly variance report|budgeting, Excel, financial reporting
Small retailer payables cleanup|accounts payable intern|checked duplicate invoice numbers and recorded vendor corrections|an aged-payables worksheet with resolved exceptions|accounts payable, invoice matching, QuickBooks
Nonprofit grant cost tracking|grants accounting assistant|mapped costs to funding restrictions and checked supporting receipts|a grant expenditure schedule|fund accounting, documentation, Excel
Payroll reconciliation exercise|payroll accounting assistant|reconciled timesheet totals against a training payroll ledger|a payroll exception log without personal identifiers|payroll controls, reconciliation, spreadsheets
"""),
    "Finance": ("BS", "corporate finance; investments; financial modeling", """
Neighborhood store cash forecast|financial planning intern|modeled weekly receipts and tested delayed-payment scenarios|a rolling cash forecast with assumptions|Excel, cash flow, scenario analysis
Municipal bond comparison|investment research assistant|compared coupon structure and issuer disclosures|a credit research brief|fixed income, financial statements, research
Student fund equity review|investment analyst intern|estimated business drivers and tested valuation sensitivities|a discounted cash flow workbook|valuation, Excel, financial analysis
Credit union loan trends|credit analysis assistant|summarized anonymized delinquency cohorts and checked denominators|a loan-performance dashboard|credit analysis, SQL, statistics
Renewable project feasibility|project finance intern|modeled capital costs and varied energy-price assumptions|a project return model with a sensitivity matrix|project finance, Excel, NPV
Household finance workshop|financial education assistant|developed illustrative savings comparisons and checked calculations|a workshop worksheet with clearly stated assumptions|financial literacy, presentation, spreadsheets
"""),
    "Marketing": ("BS", "consumer behavior; marketing research; business analytics", """
Local bookstore campaign|marketing assistant|compared newsletter subject lines using consented subscriber data|a campaign report with sample-size limitations|email marketing, Excel, copywriting
Museum visitor interviews|market research intern|coded interview themes and checked interpretation with a second reviewer|a visitor insight brief|qualitative research, interview design, thematic coding
Campus food pantry outreach|communications assistant|tested message clarity with volunteers and revised printed notices|an outreach plan and response tracking sheet|content writing, Canva, stakeholder interviews
Outdoor brand product launch|brand marketing intern|mapped competitor positioning and drafted launch materials|a positioning brief and content calendar|competitive research, presentation, copywriting
Independent podcast audience study|digital marketing assistant|analyzed listening retention by episode segment|an audience dashboard and testing recommendations|web analytics, spreadsheets, audience research
Neighborhood market survey|research assistant|piloted a survey and removed ambiguous response options|a survey summary with a sampling-bias discussion|survey design, statistics, Excel
"""),
    "Supply Chain Management": ("BS", "operations management; procurement; logistics", """
Clinic supply reorder review|inventory planning intern|compared demand variability with reorder thresholds|a replenishment workbook and stockout log|Excel, inventory planning, demand analysis
Food bank delivery routes|logistics assistant|mapped delivery windows and checked route feasibility|a route schedule and capacity assumptions|routing, spreadsheets, coordination
Supplier lead time analysis|procurement intern|cleaned purchase-order dates and compared quoted versus actual lead times|a supplier performance report|SQL, procurement, data cleaning
Warehouse slotting trial|operations improvement assistant|observed pick paths and compared alternative shelf assignments|a slotting proposal with travel-distance estimates|process mapping, Excel, warehouse operations
Packaging damage review|quality logistics intern|categorized return reasons and inspected packaging photographs|a damage trend report and test plan|quality analysis, root cause analysis, documentation
Event equipment scheduling|operations coordinator assistant|reconciled equipment reservations and identified conflicting pickups|a scheduling sheet and handoff checklist|scheduling, inventory control, communication
"""),
    "Psychology": ("BA", "research methods; cognitive psychology; developmental psychology", """
Attention task replication|behavioral research assistant|ran a supervised computer task and checked exclusion criteria|an anonymized reaction-time analysis|R, experimental design, research ethics
Youth mentoring evaluation|program evaluation assistant|coded attendance and summarized participant feedback|a participation report with response-rate caveats|survey analysis, Excel, program evaluation
Accessible study space survey|student research assistant|piloted accessibility questions and documented recruitment limitations|a survey codebook and descriptive results|Qualtrics, questionnaire design, statistics
Memory interview coding|research laboratory assistant|coded interview transcripts using a predefined rubric|an inter-rater agreement table|qualitative coding, SPSS, documentation
Workplace onboarding study|people research intern|compared onboarding feedback across departments|an onboarding recommendations brief|organizational psychology, surveys, presentation
Family resource referral map|community services assistant|verified service eligibility descriptions and updated a referral guide|a resource directory reviewed by a supervisor|resource navigation, interviewing, records management
"""),
    "Sociology": ("BA", "social research; social inequality; statistics", """
Neighborhood transit access|community research assistant|mapped service frequency and coded resident interview themes|a transit access brief with geographic limitations|GIS, interviews, qualitative analysis
Food assistance utilization|nonprofit evaluation intern|cleaned anonymized visit records and compared service-hour demand|a utilization dashboard|Excel, descriptive statistics, program evaluation
Tenant information outreach|housing program assistant|organized public information sessions and logged recurring questions|a plain-language resource guide|community outreach, writing, coordination
Campus belonging focus groups|social research assistant|prepared consent materials and coded focus-group responses|a thematic report that preserves participant anonymity|focus groups, research ethics, NVivo
Local demographic change study|planning research intern|compared census tables using consistent geographic definitions|a neighborhood trend report|census data, R, data visualization
Volunteer retention assessment|program operations assistant|reviewed attendance patterns and summarized exit feedback|a volunteer support proposal|survey analysis, Excel, facilitation
"""),
    "Political Science": ("BA", "public policy; comparative politics; research methods", """
Public meeting agenda tracker|legislative research assistant|classified agenda items and summarized committee actions|a searchable policy tracker|policy research, Excel, concise writing
Election administration accessibility|civic engagement intern|reviewed public polling-place guidance and documented access issues|an accessibility comparison memo|document review, research, presentation
Local housing policy comparison|policy analysis assistant|compared ordinance provisions across municipalities|a policy options brief with source citations|policy analysis, qualitative coding, writing
Public budget transparency review|government affairs intern|reconciled budget tables and summarized changes between drafts|a public budget explainer|budget analysis, spreadsheets, public communication
International aid program research|research institute assistant|cataloged program objectives and assessed evaluation methods|an evidence table noting missing outcome measures|literature review, comparative research, Excel
Community consultation planning|public participation assistant|organized session logistics and summarized stakeholder comments|a consultation summary with unresolved concerns|facilitation, stakeholder engagement, report writing
"""),
    "English": ("BA", "literary analysis; rhetoric; editing", """
Literary magazine production|editorial assistant|copyedited submissions and maintained a publication style sheet|a corrected issue proof and editorial checklist|copyediting, style guides, proofreading
Museum exhibit interpretation|interpretive writing intern|rewrote object labels for a general audience and checked source claims|an exhibit text set with revision notes|plain-language writing, research, editing
Software help documentation|technical writing assistant|tested setup instructions with first-time users|a revised quick-start guide and usability notes|technical writing, Markdown, user interviews
Community oral history archive|archive editorial assistant|transcribed recordings and resolved uncertain passages with annotations|a searchable transcript collection|transcription, close reading, metadata
Nonprofit grant narrative|development writing intern|assembled program evidence and drafted a grant narrative|a proposal draft with a claim-to-source checklist|grant writing, research, document editing
Public library reading program|program communications assistant|prepared age-appropriate reading prompts and event descriptions|a facilitator packet and event copy|writing, audience analysis, program coordination
"""),
    "History": ("BA", "historical methods; archival research; historiography", """
Industrial neighborhood exhibit|museum research assistant|compared newspaper accounts with municipal records|an exhibit chronology with cited sources|archival research, source criticism, writing
Historical map georeferencing|digital history intern|aligned scanned maps and documented uncertain boundaries|a layered map with provenance notes|GIS, metadata, historical research
Local oral history interviews|public history assistant|prepared interview questions and summarized differing recollections|an interview index with consent records|oral history, transcription, research ethics
Special collections finding aid|archives assistant|described collection folders and checked date ranges|a finding aid with a consistent description scheme|archival description, cataloging, attention to detail
Policy history briefing|research assistant|traced policy changes through legislative records|a briefing note distinguishing evidence from interpretation|document analysis, citation management, synthesis
Historic site education program|heritage education intern|developed source-based activities for school visitors|an educator packet and feedback summary|public speaking, curriculum support, historical interpretation
"""),
    "Graphic Design": ("BFA", "typography; visual communication; interaction design", """
Transit information poster|visual design assistant|tested route hierarchy and revised type sizes after readability checks|a print-ready poster and process notes|Adobe Illustrator, typography, print production
Accessible museum microsite|interaction design intern|prototyped navigation and observed task completion with volunteers|a Figma prototype and usability findings|Figma, accessibility, user research
Community festival identity|brand design assistant|developed identity options and applied the selected system to event materials|a compact brand guide and production files|Illustrator, layout, branding
Instructional icon library|information design intern|tested icon meanings and revised confusing symbols|an annotated SVG icon set|vector graphics, information design, testing
Local magazine page system|publication design assistant|built reusable page styles and checked print proofs|an InDesign template with preflight notes|InDesign, editorial design, prepress
Public data infographic|data visualization assistant|translated a public dataset into charts and checked scale choices|an infographic with source and accessibility notes|data visualization, Illustrator, spreadsheets
"""),
    "Music": ("BM", "music theory; ear training; music history", """
Chamber ensemble production|ensemble operations assistant|coordinated rehearsal schedules and prepared annotated parts|a rehearsal plan and concert program|score reading, scheduling, ensemble communication
Community lesson curriculum|music education assistant|prepared practice exercises and recorded learner progress|a lesson sequence with instructor feedback|instrument instruction, lesson planning, notation
Podcast sound editing|audio production intern|edited dialogue and matched loudness across segments|a mixed episode and session documentation|Reaper, audio editing, signal flow
Archive score catalog|music library assistant|identified instrumentation and corrected catalog metadata|a searchable score inventory|music notation, cataloging, research
Short film composition|composition assistant|developed cues against scene timings and revised after director feedback|a synchronized demo score and cue sheet|composition, DAW, collaboration
Live venue technical support|live sound assistant|checked microphone routing and documented stage setup under supervision|a stage plot and soundcheck checklist|mixing consoles, cabling, live audio
"""),
    "Education": ("BA", "learning theory; curriculum design; classroom assessment", """
Elementary reading station|classroom assistant|prepared phonics activities and recorded practice observations|a lesson station plan reviewed by the teacher|lesson planning, literacy support, observation
After-school science club|youth program assistant|organized inquiry activities and adapted instructions after student feedback|a hands-on activity guide|facilitation, science communication, classroom organization
Multilingual family newsletter|family engagement intern|rewrote classroom updates in plain language and coordinated translation review|a family communication template|communication, accessibility, coordination
Formative math assessment|instructional assistant|categorized common arithmetic errors using anonymized classwork|a reteaching activity plan|assessment, Excel, differentiated instruction
Digital learning accessibility|educational technology assistant|checked captions and keyboard access in course materials|an accessibility checklist and revised activity|learning management systems, accessibility, instructional design
Outdoor learning module|environmental education assistant|planned observation activities and developed weather contingency materials|a field lesson packet|curriculum design, field safety planning, facilitation
"""),
    "Nursing": ("BSN", "anatomy; physiology; nursing fundamentals", """
Patient education teach-back|nursing education assistant|observed supervised teach-back practice and revised a training handout|a plain-language simulation handout|patient communication, documentation, teach-back
Clinical handoff simulation|simulation laboratory assistant|organized standardized handoff cases and tracked omitted information|a simulation debrief checklist|SBAR, clinical documentation, teamwork
Community blood pressure outreach|community health assistant|supported supervised screening logistics and recorded de-identified counts|an outreach attendance and referral summary|health education, records handling, communication
Medication safety simulation|nursing skills lab assistant|checked mock medication labels against a training chart under supervision|a simulation discrepancy log|medication safety principles, documentation, simulation
Infection prevention observation|quality improvement assistant|summarized supervised hand-hygiene observations without patient identifiers|an adherence chart with observation limitations|quality improvement, Excel, infection prevention
Patient mobility education|rehabilitation support assistant|prepared mobility education materials reviewed by clinical staff|an illustrated patient-information draft|patient education, interdisciplinary communication, accessibility
"""),
    "Public Health": ("BS", "epidemiology; biostatistics; health promotion", """
Community vaccination outreach|health promotion assistant|mapped outreach locations and summarized anonymous attendance counts|a service reach report|health communication, Excel, community outreach
Food access mapping|public health research intern|combined store survey observations with public transit data|a neighborhood access map|GIS, survey methods, public data
Injury prevention campaign|health education assistant|reviewed evidence and tested comprehension of campaign materials|an evidence-based campaign brief|literature review, communication, program planning
Wastewater trend reporting|environmental health assistant|aligned sampling dates and flagged missing observations|a trend dashboard with uncertainty notes|R, epidemiology, data cleaning
Community program evaluation|evaluation intern|compared participation measures with stated program goals|a logic model and outcome measurement plan|program evaluation, surveys, statistics
Hospital discharge resource survey|population health assistant|cataloged public referral resources and checked eligibility descriptions|a resource gap assessment|health systems, research, stakeholder interviews
"""),
}

SIDE_WORK = (
    ("Library circulation assistant", "Checked returned items and resolved missing inventory entries; escalated account issues to staff."),
    ("Food service team member", "Prepared orders during busy shifts, checked stock levels, and trained a new teammate on closing procedures."),
    ("Community event volunteer", "Coordinated room setup, maintained a sign-in sheet, and helped visitors find scheduled sessions."),
    ("Campus recreation desk assistant", "Managed equipment checkout and documented damaged items for the facilities team."),
    ("Peer study-group organizer", "Scheduled weekly practice sessions, collected unanswered questions, and shared concise follow-up notes."),
    ("Retail inventory associate", "Reconciled shelf counts with delivery records and investigated mislabeled items with a supervisor."),
)

PRIOR_CAREERS = (
    ("Retail shift supervisor", "Scheduled staff, resolved customer complaints, and reconciled end-of-shift cash reports."),
    ("Administrative coordinator", "Maintained appointment records, documented procedures, and coordinated vendor follow-up."),
    ("Hospitality team lead", "Trained new staff, managed event handoffs, and tracked recurring service problems."),
    ("Warehouse operations associate", "Checked inbound shipments, maintained stock records, and flagged discrepancies for review."),
    ("Community program coordinator", "Organized volunteer schedules, documented attendance, and wrote progress updates."),
    ("Customer support specialist", "Investigated recurring requests, maintained a knowledge base, and escalated unresolved cases."),
)


def normalized(text: str) -> str:
    return redact_contact_details(normalize_whitespace(text))


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def category(major: str) -> str:
    return major.upper().replace(" ", "-")


def scenarios(raw: str) -> list[tuple[str, ...]]:
    records = [tuple(part.strip() for part in line.split("|")) for line in raw.strip().splitlines()]
    if len(records) != 6 or any(len(record) != 5 for record in records):
        raise ValueError("Every major must define six complete, distinct scenario families")
    return records


def family_split(major: str, family: int) -> str:
    # Rotate which scenario is held out by major; avoid confounding a single
    # style or the ordering of scenario niches with an evaluation split.
    offset = int(sha256(major)[:8], 16) % 6
    slot = (family + offset) % 6
    return "test" if slot == 0 else "val" if slot == 1 else "train"


def academic_major(skill_domain: str, family: int) -> str:
    """Two scenario families per eligible domain use a different academic major.

    Each mapping is a permutation, retaining exactly six families for every
    academic major. Nursing and Education stay within their course pathways;
    this avoids fabricating regulated clinical or teacher-training credentials.
    """
    eligible = [major for major in DOMAINS if major not in {"Nursing", "Education"}]
    if family not in {1, 4} or skill_domain not in eligible:
        return skill_domain
    offset = 7 if family == 1 else 11
    return eligible[(eligible.index(skill_domain) + offset) % len(eligible)]


def evidence_variant(domain_index: int, family: int, stage: str) -> str:
    if stage == "first_year" and (domain_index + family) % 4 == 0:
        return "substantive_prior_project"
    if stage == "senior" and (domain_index + 2 * family) % 4 == 1:
        return "coursework_without_placement"
    return "standard"


def render(major: str, degree: str, courses: str, scenario: tuple[str, ...],
           family: int, stage: str, *, skill_domain: str | None = None,
           variant: str = "standard") -> str:
    title, role, activity, deliverable, tools = scenario
    side_role, side_duties = SIDE_WORK[family]
    prior_role, prior_duties = PRIOR_CAREERS[family]
    course_list = courses.split("; ")
    tools_list = tools.split(", ")
    if stage == "first_year":
        education = f"{degree} in {major}, first-year student, expected 2030. Coursework: {course_list[0]}; introductory writing and quantitative reasoning."
        experience = f"{side_role}, part-time, 2026-present. {side_duties}"
        project = (f"{title}, introductory student club activity. Shadowed a team member and kept a record of the methods used. "
                   f"The team produced {deliverable}; my contribution was a short background summary. "
                   "Have not yet completed an internship in this field.")
        skills = f"Introductory exposure to {tools_list[0]}; spreadsheets; written communication."
    elif stage == "sophomore":
        education = f"{degree} in {major}, second-year student, expected 2029. Completed coursework: {course_list[0]}; {course_list[1]}."
        experience = f"{side_role}, part-time, 2025-present. {side_duties}"
        project = (f"{title}, semester course project. In a small supervised student team, {activity}. "
                   f"Helped prepare {deliverable}. Instructor reviewed the methods; results have not been used in a production setting.")
        skills = f"Coursework use of {tools}; documenting methods; peer collaboration."
    elif stage == "junior":
        education = f"{degree} in {major}, third-year student, expected 2028. Coursework: {courses}."
        experience = (f"{role.capitalize()}, ten-week supervised placement, summer 2026. For the {title.lower()} assignment, {activity}. "
                      f"Prepared {deliverable}; incorporated supervisor corrections before handoff.")
        project = (f"Methods notebook. Reworked a course exercise using a different input and recorded where the original assumptions stopped applying. "
                   f"Additional experience: {side_role.lower()}. {side_duties}")
        skills = f"Practical use of {tools}; reporting limitations; team communication."
    elif stage == "senior":
        education = f"{degree} in {major}, fourth-year student, expected 2027. Coursework: {courses}; capstone seminar."
        experience = (f"{role.capitalize()}, six-month placement, 2026. {activity.capitalize()}. "
                      f"Delivered {deliverable} and explained unresolved issues during the final handoff. "
                      "Reviewed another student's work against a shared checklist.")
        project = (f"{title}, capstone extension. Compared an alternative approach with the placement method, "
                   "documented a case where it performed poorly, and presented the tradeoffs to faculty. "
                   "Maintained a reproducible record of inputs and revisions.")
        skills = f"{tools}; independent task planning; review and documentation."
    elif stage == "masters":
        masters_degree = "MS" if degree in ("BS", "BSN") else "MA" if degree == "BA" else "MFA" if degree == "BFA" else "MM"
        education = (f"{masters_degree} in {major}, graduate student, expected 2027. Prior {degree} in {major}, completed 2025. "
                     "Graduate coursework: research design, evidence evaluation, and specialist methods.")
        experience = (f"Graduate research assistant, 2025-present. Extended the {title.lower()} investigation: {activity}. "
                      f"Produced {deliverable} with a methods appendix. Compared findings with published work "
                      "and documented a failed replication rather than removing it from the analysis.")
        project = (f"Prior experience: {role}, one semester. Assisted a supervisor with routine records and method checks. "
                   "Teaching support: prepared a worked example and offered feedback on student reasoning; "
                   "no independent management responsibility claimed.")
        skills = f"{tools}; literature synthesis; uncertainty analysis; technical presentation."
        if major == "Nursing":
            education += " Registered Nurse license held; graduate work focuses on education and quality improvement."
    else:
        education = (f"Post-baccalaureate coursework in {major}, 2026-present. Prior bachelor's degree in a different field, completed 2020. "
                     f"Recent study: {course_list[0]}; {course_list[1]}. Seeking an entry-level transition.")
        experience = f"{prior_role}, 2021-2026. {prior_duties}"
        project = (f"{title}, supervised continuing-education project, 2026. {activity.capitalize()}. "
                   f"Prepared {deliverable} with instructor feedback. "
                   "This is project experience; have not held a professional role in the new field.")
        skills = f"Recent training in {tools}; transferable coordination, recordkeeping, and communication."
    if skill_domain is not None and skill_domain != major:
        domain_courses = DOMAINS[skill_domain][1]
        education += (f" Additional electives and mentored study in {skill_domain}: {domain_courses}. "
                      "The project experience below is outside the primary degree field.")
    if variant == "substantive_prior_project":
        experience = (f"Community volunteer project contributor, 2024-2026, mentored part-time work. "
                      f"For {title.lower()}, {activity}. Prepared {deliverable}, "
                      "checked the work with a supervisor, and revised it after review. This experience began before university enrollment.")
        project = (f"Documented the method in a working portfolio and demonstrated the results to the project group. "
                   f"Additional experience: {side_role.lower()}. {side_duties}")
        skills = f"Hands-on experience with {tools}; reviewing evidence; explaining practical limitations."
    elif variant == "coursework_without_placement":
        experience = (f"{side_role}, part-time, 2023-present. {side_duties} "
                      "Have not yet completed a placement or internship in the target field.")
        project = (f"{title}, literature-based course assignment. Summarized relevant approaches and compared published examples. "
                   "Submitted a short review with cited limitations; no implemented system, independent experiment, "
                   "or field study was completed. The assignment was assessed as classroom work.")
        skills = (f"Coursework familiarity with {tools_list[0]}; academic writing; spreadsheets. "
                  "Practical use of specialist methods remains limited.")
    sections = {"Education": education, "Experience": experience, "Projects": project, "Skills": skills}
    # Different organization is independent of split and has no label-bearing text.
    layout = (family + STAGES.index(stage)) % 6
    orders = (
        ("Education", "Projects", "Experience", "Skills"),
        ("Education", "Experience", "Skills", "Projects"),
        ("Skills", "Projects", "Education", "Experience"),
        ("Experience", "Projects", "Education", "Skills"),
        ("Education", "Skills", "Experience", "Projects"),
        ("Projects", "Experience", "Skills", "Education"),
    )
    if layout in (0, 3):
        return "\n\n".join(f"{name.upper()}\n{sections[name]}" for name in orders[layout])
    if layout in (1, 4):
        return "\n".join(f"{name}: {sections[name]}" for name in orders[layout])
    return "\n\n".join(f"{name}\n- {sections[name]}" for name in orders[layout])


def build_rows() -> list[dict[str, str]]:
    rows = []
    for domain_index, (skill_domain, (_, _, raw)) in enumerate(DOMAINS.items()):
        for family, scenario in enumerate(scenarios(raw)):
            major = academic_major(skill_domain, family)
            degree, courses, _ = DOMAINS[major]
            family_id = f"fictional-{sha256(skill_domain + '|' + scenario[0])[:16]}"
            split = family_split(major, family)
            for stage in STAGES:
                variant = evidence_variant(domain_index, family, stage)
                text = render(major, degree, courses, scenario, family, stage,
                              skill_domain=skill_domain, variant=variant)
                clean_text = normalized(text)
                digest = sha256(clean_text)
                rows.append({
                    "resume_id": f"resume-{digest[:16]}", "Resume_str": text,
                    "Category": category(major), "major": major, "skill_domain": skill_domain, "student_year": stage,
                    "career_stage": "career_changer" if stage == "career_changer" else "graduate" if stage == "masters" else "undergraduate",
                    "degree_level": "postbaccalaureate" if stage == "career_changer" else "masters" if stage == "masters" else "bachelors",
                    "source": "independently_authored_fictional", "profile_family": family_id, "family_id": family_id,
                    "split": split, "scenario": scenario[0], "evidence_variant": variant, "version": VERSION,
                    "text_sha256": digest,
                })
    return rows


def write_corpus(out_dir: Path) -> dict:
    rows = build_rows()
    out_dir.mkdir(parents=True, exist_ok=True)
    for split in (None, "train", "val", "test"):
        path = out_dir / ("resumes.csv" if split is None else f"resumes_{split}.csv")
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(row for row in rows if split is None or row["split"] == split)
    manifest = {
        "version": VERSION, "source": "independently_authored_fictional",
        "reference_catalogs_are_training_sources": False,
        "labels_assigned": False, "reference_date": "2026-10-15",
        "documents": len(rows), "scenario_families": len({row["profile_family"] for row in rows}),
        "majors": sorted(DOMAINS), "stages": list(STAGES),
        "documents_per_split": dict(sorted(Counter(row["split"] for row in rows).items())),
        "independence_unit": "profile_family",
        "family_split_rule": "sha256(academic major) rotation; one family test, one val, four train; all six stage variants remain together",
        "cross_major_documents": sum(row["major"] != row["skill_domain"] for row in rows),
        "evidence_variant_counts": dict(sorted(Counter(row["evidence_variant"] for row in rows).items())),
        "resume_id_rule": "resume- plus first 16 hex chars of sha256 of whitespace-normalized Resume_str",
        "families": {row["profile_family"]: {"split": row["split"], "major": row["major"], "skill_domain": row["skill_domain"], "scenario": row["scenario"]} for row in rows},
        "corpus_sha256": sha256("\n".join(row["resume_id"] + "|" + row["split"] for row in rows)),
        "limitations": [
            "Fictional educational examples; do not claim these are real applicants or representative population samples.",
            "Six stage variants in one family share a scenario and are correlated; keep every variant in its frozen split.",
            "Common section structure and course names recur across families; this is not an independent test of real resume generalization.",
            "Evaluate on untouched, lawfully sourced real resume holdouts as well as this synthetic suite.",
            "Unknown licensure and credentials must not be inferred; nursing RN status is explicit only in the graduate variants.",
            "No job-match labels are embedded; teacher labeling and validation must be separate steps.",
        ],
    }
    (out_dir / "corpus_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, default=Path("data/major_agnostic"))
    args = parser.parse_args()
    manifest = write_corpus(args.out_dir)
    print(f"Wrote {manifest['documents']} fictional resumes, {manifest['scenario_families']} scenario families, "
          f"{len(manifest['majors'])} majors to {args.out_dir}")
    print(json.dumps(manifest["documents_per_split"], sort_keys=True))


if __name__ == "__main__":
    main()
