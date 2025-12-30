const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const { NlpManager } = require("node-nlp");
require("dotenv").config();

const RESUME_PATH = path.join(__dirname, "resume.txt");
const JOBS_PATH = path.join(__dirname, "example_jobs.json");
const MODEL_PATH = path.join(__dirname, "public", "model.nlp");

async function trainWithOpenAI() {
  console.log("--- Starting Auto-Training with OpenAI ---");

  // 1. Check API Key
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "ERROR: OPENAI_API_KEY not found in .env or environment variables."
    );
    process.exit(1);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const manager = new NlpManager({
    languages: ["en"],
    forceNER: true,
    nlu: { log: true },
  });

  // 2. Load Data
  console.log("Loading resume and jobs...");
  const resumeText = fs.readFileSync(RESUME_PATH, "utf8");
  // Handle both array and object wrapper formats for jobs just in case
  let jobsDataRaw = JSON.parse(fs.readFileSync(JOBS_PATH, "utf8"));
  const jobs = Array.isArray(jobsDataRaw)
    ? jobsDataRaw
    : jobsDataRaw.models || [];

  console.log(`Found ${jobs.length} jobs. Processing...`);

  // 3. Process each job (Limit to first 10 for testing/cost, or remove limit for full)
  // User requested ~100-200 jobs. Setting to 150.
  const jobsToProcess = jobs.slice(0, 150);

  for (const job of jobsToProcess) {
    const jobText = (job.job_title + "\n" + job.job_desc).replace(
      /<[^>]*>/g,
      ""
    ); // Strip HTML
    console.log(`\nAnalyzing: ${job.job_title}`);

    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini", // Using mini as per user's python script preference
        messages: [
          {
            role: "system",
            content: `You are a job qualification analyzer. 
            User Resume: "${resumeText}"
            
            Task: Analyze the Job Description. Determine if the user is qualified based ONLY on:
            1. Graduation Date / Year
            2. School Year (e.g. Freshman, Sophomore, Junior, Senior)
            
            Return a JSON object in this format:
            {
              "qualified": boolean, 
              "reason_type": "grad_year" | "school_year" | "other" | "none",
              "evidence_text": "Exact sentence or phrase from the job description that makes them unqualified. If qualified, leave empty."
            }`,
          },
          {
            role: "user",
            content: `Job Title: ${job.job_title}\nJob Description: ${jobText}`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(completion.choices[0].message.content);
      console.log(
        ` > AI Result: Qualified? ${result.qualified} | Reason: ${result.reason_type}`
      );

      // 4. Add to NLP Manager
      if (!result.qualified && result.evidence_text) {
        // If not qualified due to strict year requirement, label that specific text
        if (result.reason_type === "grad_year") {
          console.log(
            `   + Training 'requirement.grad_year' on: "${result.evidence_text}"`
          );
          manager.addDocument(
            "en",
            result.evidence_text,
            "requirement.grad_year"
          );
        } else if (result.reason_type === "school_year") {
          console.log(
            `   + Training 'requirement.school_year' on: "${result.evidence_text}"`
          );
          manager.addDocument(
            "en",
            result.evidence_text,
            "requirement.school_year"
          );
        }
      } else {
        // Optionally add positive examples?
        // For now, nlp.js mainly needs to know what DOES look like a requirement.
        // If we want to detect "eligible", we might need a "neutral" or "eligible" intent.
        // Let's add it to 'description' or 'none' to balance?
        // Actually, NLP.js calculates intent scores. If no intent matches, it returns None.
      }
    } catch (err) {
      console.error(`Error processing job: ${err.message}`);
    }
  }

  // 5. Add some basic built-in entities/intents just in case OpenAI didn't find enough
  // (We can import the existing train.js logic here too, but let's stick to OpenAI for now
  // or maybe load the existing model first?)
  // User wanted to "train this model", implying we might be training from scratch or updating.
  // Let's explicitly add the Entities from our manual `train.js` because OpenAI won't generate those.
  console.log("\nAdding static entities...");
  const schoolYears = [
    "freshman",
    "sophomore",
    "junior",
    "senior",
    "graduate",
    "master",
    "phd",
    "mba",
  ];
  schoolYears.forEach((year) => {
    manager.addNamedEntityText("school_year", year, ["en"], [year]);
    // Also add plural
    manager.addNamedEntityText("school_year", year, ["en"], [year + "s"]);
  });

  // 6. Train
  console.log("\nTraining NLP Model...");
  await manager.train();
  manager.save(MODEL_PATH);
  console.log(`\nModel saved to ${MODEL_PATH}`);
}

trainWithOpenAI();
