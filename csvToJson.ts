import { bigintToFloat } from "./utils";

const fs = require("fs");
// const { google } = require("googleapis");
const { parse } = require("json2csv");

// Your JSON data
const jsonFilePath = "./data.json"; // Replace with your JSON file path
const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, "utf-8"));

// Convert JSON data to CSV
const rows = Object.entries(jsonData).map(([key, value]) => {
  value = value.map((s) => bigintToFloat(BigInt(s)));
  return [key, ...value]; // Flattening the JSON structure
});

const csvData = parse([
  [
    "Address",
    "rawBFR",
    "rawEsBFR",
    "BLP",
    "Vestor1 Pending",
    "Vestor2 Pending",
    "Staking",
  ],
  ...rows,
]);

// Save CSV to a file
const csvFilePath = "./data1.csv";
fs.writeFileSync(csvFilePath, csvData, "utf-8");

// Function to upload CSV to Google Drive
