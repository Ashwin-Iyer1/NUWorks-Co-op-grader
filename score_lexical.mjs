#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [matcherPath, inputPath, outputPath] = process.argv.slice(2);
if (!matcherPath || !inputPath || !outputPath) {
  throw new Error("usage: node score_lexical.mjs MATCHER INPUT_JSON OUTPUT_JSON");
}
const { default: JobMatcher } = await import(pathToFileURL(path.resolve(matcherPath)).href);
const matcher = new JobMatcher();
const rows = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const scores = rows.map(({ resume, job }) => matcher.calculateScore(resume, job).score / 100);
fs.writeFileSync(outputPath, JSON.stringify(scores));
