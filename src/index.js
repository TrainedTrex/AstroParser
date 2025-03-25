/**
 * Main entry point for the DE440 ephemeris parser
 */

const fs = require('fs');
const path = require('path');
const DE440Parser = require('./parser');
const { parseCommandLine, loadConfig } = require('./cli');
const { writeFile, julianDateToString } = require('./utils');
const { BODIES, BODY_NAMES } = require('./constants');

// Map of body names to body IDs
const BODY_NAME_TO_ID = Object.entries(BODY_NAMES).reduce((map, [id, name]) => {
  map[name.toLowerCase()] = parseInt(id, 10);
  return map;
}, {});

/**
 * Main function
 */
async function main() {
  try {
    console.log('DE440 Ephemeris Parser');
    console.log('----------------------');
    
    // Parse command-line arguments and load config
    const cliOptions = parseCommandLine();
    const config = loadConfig(cliOptions);
    
    // Initialize the parser
    const parser = new DE440Parser(config);
    await parser.initialize();
    
    // Parse the data files
    let dataFiles;
    
    if (config.inputFiles.dataFilePattern) {
      // Use the pattern to find files
      dataFiles = config.inputFiles.dataFilePattern;
    } else if (Array.isArray(config.inputFiles.dataFiles) && config.inputFiles.dataFiles.length > 0) {
      // Use the explicitly listed files
      dataFiles = config.inputFiles.dataFiles;
    } else if (config.inputFiles.dataFile) {
      // Fallback to single file (for backward compatibility)
      dataFiles = [config.inputFiles.dataFile];
    } else {
      throw new Error('No data files specified. Please configure dataFiles, dataFilePattern, or dataFile in config.');
    }
    
    const dataRecords = await parser.parseDataFiles(dataFiles);
    
    if (!dataRecords || dataRecords.length === 0) {
      console.error("Error: No data records found in the provided files.");
      process.exit(1);
    }
    
    // Print information about the first record as a sanity check
    const firstRecord = dataRecords[0];
    console.log(`First record info: JD ${firstRecord.startJD} to ${firstRecord.endJD}, ${firstRecord.coefficients.length} coefficients`);
    
    // Process the requested bodies and dates
    const results = await processRequests(parser, dataRecords, config);
    
    if (results.length === 0) {
      console.warn("No results generated. Please check your body and date selection.");
    } else {
      // Output the results
      await outputResults(results, config);
      console.log(`Successfully generated results for ${results.length} positions.`);
    }
    
    console.log('Processing completed successfully.');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

/**
 * Process requests for body positions at specific dates
 * @param {DE440Parser} parser - Parser instance
 * @param {Array} dataRecords - Parsed data records
 * @param {Object} config - Configuration
 * @returns {Array} - Results
 */
async function processRequests(parser, dataRecords, config) {
  const results = [];
  
  if (!dataRecords || dataRecords.length === 0) {
    console.error("No data records available for processing.");
    return results;
  }
  
  // Determine which bodies to process
  const bodiesToProcess = config.bodies.length > 0
    ? config.bodies.map(name => {
        const id = BODY_NAME_TO_ID[name.toLowerCase()];
        if (id === undefined) {
          throw new Error(`Unknown body name: ${name}`);
        }
        return id;
      })
    : Object.keys(BODIES).map(key => BODIES[key]);
  
  // Determine which dates to process
  let datesToProcess = [];
  if (config.timeRange.start && config.timeRange.end) {
    // Single date or range
    if (config.timeRange.start === config.timeRange.end) {
      datesToProcess = [config.timeRange.start];
      console.log(`Computing positions for a single date: JD ${config.timeRange.start}`);
    } else {
      // Generate dates within range using the specified step
      const start = config.timeRange.start;
      const end = config.timeRange.end;
      const step = config.timeStep || 1.0; // Default to 1 day if not specified
      
      console.log(`Computing positions from JD ${start} to ${end} with step ${step} days`);
      
      for (let jd = start; jd <= end; jd += step) {
        datesToProcess.push(jd);
      }
    }
  } else {
    // Use the middle of the first data record as a default
    const firstRecord = dataRecords[0];
    datesToProcess = [(firstRecord.startJD + firstRecord.endJD) / 2];
    console.log(`No date specified. Using middle of first record: JD ${datesToProcess[0]}`);
  }
  
  console.log(`Processing ${bodiesToProcess.length} bodies at ${datesToProcess.length} dates...`);
  
  // Compute positions for each body at each date
  for (const bodyId of bodiesToProcess) {
    for (const jd of datesToProcess) {
      try {
        const position = parser.computeBodyPosition(bodyId, jd, dataRecords);
        
        results.push({
          body: BODY_NAMES[bodyId],
          julianDate: jd,
          date: julianDateToString(jd),
          position
        });
        
        if (config.logLevel === 'verbose') {
          console.log(`Computed position for ${BODY_NAMES[bodyId]} at JD ${jd}`);
          console.log(position);
        }
      } catch (error) {
        console.warn(`Could not compute position for ${BODY_NAMES[bodyId]} at JD ${jd}: ${error.message}`);
      }
    }
  }
  
  return results;
}

/**
 * Output the results to files
 * @param {Array} results - Computed results
 * @param {Object} config - Configuration
 */
async function outputResults(results, config) {
  const outputDir = config.outputDir;
  
  // Create the output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Output based on format
  if (config.outputFormat === 'json') {
    const outputPath = path.join(outputDir, 'de440_results.json');
    await writeFile(outputPath, JSON.stringify(results, null, 2));
    console.log(`Results written to ${outputPath}`);
  } else if (config.outputFormat === 'csv') {
    // Group results by body
    const resultsByBody = results.reduce((groups, result) => {
      if (!groups[result.body]) {
        groups[result.body] = [];
      }
      groups[result.body].push(result);
      return groups;
    }, {});
    
    // Output a CSV file for each body
    for (const [body, bodyResults] of Object.entries(resultsByBody)) {
      const outputPath = path.join(outputDir, `${body.toLowerCase()}.csv`);
      
      // Create CSV header
      const components = Object.keys(bodyResults[0].position);
      const header = ['julian_date', 'date', ...components].join(',');
      
      // Create CSV rows
      const rows = bodyResults.map(result => {
        const values = [
          result.julianDate,
          result.date,
          ...components.map(comp => result.position[comp])
        ];
        return values.join(',');
      });
      
      // Write CSV file
      const csvContent = [header, ...rows].join('\n');
      await writeFile(outputPath, csvContent);
      console.log(`Results for ${body} written to ${outputPath}`);
    }
  } else {
    console.warn(`Unsupported output format: ${config.outputFormat}`);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});