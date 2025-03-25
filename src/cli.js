/**
 * Command-line interface for the DE440 ephemeris parser
 */

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { julianDateToString } = require('./utils');

/**
 * Configure and parse the command-line arguments
 */
function parseCommandLine() {
  program
    .name('de440-parser')
    .description('NASA DE440 ephemeris data parser')
    .version('1.0.0');

    program
    .option('-c, --config <path>', 'Path to config file', './config.json')
    .option('-i, --input <paths>', 'Path(s) to input data file(s) (comma-separated or glob pattern)')
    .option('-h, --header <path>', 'Path to header file')
    .option('-o, --output <path>', 'Path to output directory')
    .option('-f, --format <format>', 'Output format (json, csv)', 'json')
    .option('-b, --body <body>', 'Specific body to process (e.g., "mars", "sun")')
    .option('-d, --date <date>', 'Specific date to compute (in JD or YYYY-MM-DD format)')
    .option('--start-date <date>', 'Start date for time range (in JD or YYYY-MM-DD format)')
    .option('--end-date <date>', 'End date for time range (in JD or YYYY-MM-DD format)')
    .option('--step <days>', 'Step size in days between computed positions', '1')
    .option('--frame <frame>', 'Reference frame (ICRF, ECLIPTIC_J2000)', 'ICRF')
    .option('--center <center>', 'Coordinate center (SSB, SUN)', 'SSB')
    .option('-v, --verbose', 'Enable verbose output');

  program.parse();
  return program.opts();
}

/**
 * Load the config file and merge with command-line options
 * @param {Object} cliOptions - Command-line options
 * @returns {Object} - Merged configuration
 */
function loadConfig(cliOptions) {
  let config = {};

  // Try to load the config file
  const configPath = cliOptions.config || './config.json';
  try {
    const configStr = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configStr);
    console.log(`Loaded configuration from ${configPath}`);
  } catch (err) {
    console.warn(`Could not load config file ${configPath}: ${err.message}`);
    console.log('Using default configuration...');
    
    // Default configuration
    config = {
      inputFiles: {
        header: './data/header.440',
        dataFile: './data/data.440'
      },
      outputDir: './output',
      outputFormat: 'json',
      bodies: [],
      timeRange: {
        start: null,
        end: null
      },
      logLevel: 'info'
    };
  }

  // Override config with CLI options
  if (cliOptions.input) {
    // Check if input is a comma-separated list
    if (cliOptions.input.includes(',')) {
      config.inputFiles.dataFiles = cliOptions.input.split(',').map(path => path.trim());
    } 
    // Check if input is a glob pattern
    else if (cliOptions.input.includes('*')) {
      config.inputFiles.dataFilePattern = cliOptions.input;
    }
    // Single file
    else {
      config.inputFiles.dataFiles = [cliOptions.input];
    }
  }
  
  if (cliOptions.header) {
    config.inputFiles.header = cliOptions.header;
  }
  
  if (cliOptions.output) {
    config.outputDir = cliOptions.output;
  }
  
  if (cliOptions.format) {
    config.outputFormat = cliOptions.format;
  }
  
  if (cliOptions.body) {
    config.bodies = [cliOptions.body.toLowerCase()];
  }
  
  if (cliOptions.date) {
    const date = parseDate(cliOptions.date);
    config.timeRange.start = date;
    config.timeRange.end = date;
  }
  
  if (cliOptions.verbose) {
    config.logLevel = 'verbose';
  }

  return config;
}

/**
 * Parse a date string to Julian date
 * @param {string} dateStr - Date string (JD or YYYY-MM-DD)
 * @returns {number} - Julian date
 */
function parseDate(dateStr) {
  // Check if it's already a Julian date
  if (!isNaN(dateStr) && dateStr.includes('.')) {
    return parseFloat(dateStr);
  }
  
  // Otherwise, parse as YYYY-MM-DD
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}. Use JD (e.g., 2459000.5) or YYYY-MM-DD.`);
  }
  
  // Convert to Julian date
  // Julian date at Jan 1, 4713 BC 12:00 GMT is 0
  // Julian date at Jan 1, 1970 00:00 UTC is 2440587.5
  const unixTime = date.getTime() / 86400000; // days since Unix epoch
  const julianDate = unixTime + 2440587.5; // JD of Unix epoch
  
  console.log(`Converted date "${dateStr}" to Julian date: ${julianDate}`);
  return julianDate;
}

module.exports = {
  parseCommandLine,
  loadConfig
};