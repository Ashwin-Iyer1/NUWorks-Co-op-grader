const { NlpManager } = require("node-nlp");
const fs = require("fs");
const path = require("path");

// Mock User Data based on resume.txt
const userResume = `
Availability: Jan â€“ Aug 2026 Ashwin H. Iyer
Education: Northeastern University Expected May 2028
Candidate for Bachelor of Science in Computer Science and Business Administration
Current School Year: Sophomore (Based on May 2028 grad date and current time 2025-12)
`;

// Helper to determine school year from grad date for logic check
// Current Date: Dec 2025. Grad Date: May 2028.
// Years remaining: 2.5 years.
// Likely Sophomore or Junior depending on detailed calc.
// Let's assume user inputs "Sophomore" or "Junior".
const userSchoolYear = "Sophomore";
const userGradDate = "2028-05";

async function testModel() {
  const manager = new NlpManager({ languages: ["en"], forceNER: true });

  if (fs.existsSync("public/model.nlp")) {
    const data = fs.readFileSync("public/model.nlp", "utf8");
    manager.import(data);
  } else {
    console.error("Model not found! Run 'npm run train' first.");
    return;
  }

  // Load Jobs
  const jobsData = JSON.parse(fs.readFileSync("example_jobs.json", "utf8"));

  console.log("--- Testing NLP Model ---");
  console.log(`User: ${userSchoolYear}, Graduating: ${userGradDate}`);
  console.log(`Resume Preview: ${userResume.substring(0, 100)}...`);
  console.log("-----------------------------------");

  for (const job of jobsData.models.slice(0, 5)) {
    const text = (job.job_title + "\n" + job.job_desc).toLowerCase();

    console.log(`\nJob: ${job.job_title}`);
    const result = await manager.process("en", text);

    // Check Intents/Entities
    const schoolYearEntities = result.entities.filter(
      (e) => e.entity === "school_year"
    );
    const gradYearEntities = result.entities.filter(
      (e) => e.entity === "number" || e.entity === "dimension"
    ); // node-nlp built-ins
    // We defined intents in train.js checking for:
    // requirement.school_year
    // requirement.grad_year

    const isSchoolYear = result.intent === "requirement.school_year";
    const isGradYear = result.intent === "requirement.grad_year";

    console.log(
      `   > Intent detected: ${result.intent} (Score: ${result.score})`
    );

    if (schoolYearEntities.length > 0) {
      console.log(
        `   > School Year Entities: ${schoolYearEntities
          .map((e) => e.option)
          .join(", ")}`
      );
      // Logic Check
      const requiredYears = schoolYearEntities.map((e) => e.option);
      if (!requiredYears.includes(userSchoolYear.toLowerCase())) {
        console.log(`   [X] NOT ELIGIBLE (Year mismatch)`);
      } else {
        console.log(`   [?] Year matched (needs manual verification)`);
      }
    } else {
      console.log(`   > No specific school year requirement detected.`);
    }

    // Simple regex fallback output for comparison (what we had before)
    // ...
  }
}

testModel();
