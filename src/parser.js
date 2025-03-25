/**
 * Parser for DE440 ephemeris data
 */

const path = require('path');
const { BODIES, BODY_NAMES, COMPONENTS_COUNT, COMPONENT_NAMES, GROUPS } = require('./constants');
const { readFile, parseScientificNotation, evaluateChebyshev, normalizeTime, findFiles, sortFilesByDatePattern } = require('./utils');

/**
 * DE440 parser class
 */
class DE440Parser {
  constructor(config) {
    this.config = config;
    this.headerData = null;
    this.constants = {};
    this.coefficientInfo = [];
  }

  /**
   * Initialize the parser by reading and parsing the header file
   */
  async initialize() {
    console.log('Initializing DE440 parser...');
    const headerContent = await readFile(this.config.inputFiles.header);
    await this.parseHeader(headerContent);
    console.log('DE440 parser initialized successfully.');
  }

  /**
   * Parse the header file content
   * @param {string} headerContent - Content of the header file
   */
  async parseHeader(headerContent) {
    console.log('Parsing header file...');

    // Check the very first line for KSIZE/NCOEFF before splitting into groups
    const lines = headerContent.split('\n');
    if (lines.length > 0 && lines[0].includes('KSIZE') && lines[0].includes('NCOEFF')) {
      const firstLine = lines[0].trim();
      const match = firstLine.match(/KSIZE=\s*(\d+)\s*NCOEFF=\s*(\d+)/);
      if (match) {
        this.constants.KSIZE = parseInt(match[1], 10);
        this.constants.NCOEFF = parseInt(match[2], 10);
        console.log(`Found in first line: KSIZE: ${this.constants.KSIZE}, NCOEFF: ${this.constants.NCOEFF}`);
      }
    }

    // Split the content into lines and then into groups
    const groups = this.splitIntoGroups(lines);

    // Parse each group
    this.parseKSizeGroup(groups[GROUPS.KSIZE]);
    this.parseTimeConstantsGroup(groups[GROUPS.TIME_CONSTANTS]);
    this.parseConstantNamesGroup(groups[GROUPS.CONSTANT_NAMES]);
    this.parseConstantValuesGroup(groups[GROUPS.CONSTANT_VALUES]);
    this.parseCoefficientInfoGroup(groups[GROUPS.COEFFICIENT_INFO]);

    console.log('Header parsing completed.');
  }

  /**
   * Split the file lines into groups based on GROUP markers
   * @param {Array<string>} lines - Lines from the file
   * @returns {Object} - Groups indexed by group number
   */
  splitIntoGroups(lines) {
    const groups = {};
    let currentGroup = null;
    let currentGroupContent = [];

    // First, try to find explicit GROUP markers
    let hasExplicitGroups = false;
    
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (line.startsWith('GROUP')) {
        hasExplicitGroups = true;
        // If we were already parsing a group, save it
        if (currentGroup) {
          groups[currentGroup] = currentGroupContent;
        }

        // Extract the group number and start a new group
        const match = line.match(/GROUP\s+(\d+)/);
        if (match) {
          currentGroup = match[1];
          currentGroupContent = [];
        }
      } else if (currentGroup) {
        currentGroupContent.push(line);
      }
    }

    // Add the last group if there is one
    if (currentGroup) {
      groups[currentGroup] = currentGroupContent;
    }
    
    // If no explicit groups were found, try to infer groups based on file content
    if (!hasExplicitGroups) {
      console.log("No explicit GROUP markers found. Attempting to infer structure...");
      
      // Check if this is a data file with Chebyshev coefficients
      // Data files typically start with two dates (Julian dates)
      const dateLinePattern = /^\s*\d+\.\d+\s+\d+\.\d+/;
      let dataLines = [];
      
      // Collect all lines that appear to be data records
      for (let line of lines) {
        if (dateLinePattern.test(line) || 
            (line.trim() && dataLines.length > 0 && !line.includes('GROUP'))) {
          dataLines.push(line);
        }
      }
      
      if (dataLines.length > 0) {
        console.log(`Found ${dataLines.length} potential data lines without GROUP markers.`);
        groups[GROUPS.DATA] = dataLines;
      }
      
      // For header files, try to infer the structure from content patterns
      if (lines.some(line => line.includes('KSIZE='))) {
        // This looks like a header file with KSIZE info
        groups[GROUPS.KSIZE] = lines.filter(line => line.includes('KSIZE=') || 
                                               line.includes('JPL Planetary') ||
                                               line.includes('Epoch:'));
      }
      
      // Look for time constants section (3 floating point numbers)
      const timeConstantPattern = /^\s*\d+\.\d+\s+\d+\.\d+\s+\d+\.\d+\s*$/;
      const timeConstantLines = lines.filter(line => timeConstantPattern.test(line));
      if (timeConstantLines.length > 0) {
        groups[GROUPS.TIME_CONSTANTS] = timeConstantLines;
      }
      
      // Try to find constant names section
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*\d+\s*$/.test(lines[i]) && i + 1 < lines.length && 
            lines[i+1].includes('DENUM') && lines[i+1].includes('LENUM')) {
          let constantNameLines = [lines[i]];
          let j = i + 1;
          while (j < lines.length && lines[j].trim() && !lines[j].includes('GROUP')) {
            constantNameLines.push(lines[j]);
            j++;
          }
          groups[GROUPS.CONSTANT_NAMES] = constantNameLines;
          break;
        }
      }
      
      // Try to find constant values section
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*\d+\s*$/.test(lines[i]) && i + 1 < lines.length && 
            /\d+\.\d+D[+-]\d+/.test(lines[i+1])) {
          let constantValueLines = [lines[i]];
          let j = i + 1;
          while (j < lines.length && lines[j].trim() && !lines[j].includes('GROUP')) {
            constantValueLines.push(lines[j]);
            j++;
          }
          groups[GROUPS.CONSTANT_VALUES] = constantValueLines;
          break;
        }
      }
      
      // Try to find coefficient info section (3 rows of integers)
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*\d+\s*$/.test(lines[i]) && i + 1 < lines.length) {
          // Check if next lines contain only integers
          let isCoeffInfoSection = true;
          for (let j = i + 1; j < i + 4 && j < lines.length; j++) {
            if (!/^\s*[\d\s]+$/.test(lines[j])) {
              isCoeffInfoSection = false;
              break;
            }
          }
          
          if (isCoeffInfoSection) {
            let coeffInfoLines = [lines[i]];
            for (let j = i + 1; j < i + 4 && j < lines.length; j++) {
              coeffInfoLines.push(lines[j]);
            }
            groups[GROUPS.COEFFICIENT_INFO] = coeffInfoLines;
            break;
          }
        }
      }
    }

    return groups;
  }

  /**
   * Parse the KSIZE group (1010)
   * @param {Array<string>} lines - Lines in the group
   */
  parseKSizeGroup(lines) {
    if (!lines || lines.length === 0) {
      console.warn('KSIZE group is empty or not found.');
      return;
    }

    // Try different patterns for KSIZE/NCOEFF
    let ksizeFound = false;
    
    // First, check the very first line outside of any group
    // This is common in some header.440 files where KSIZE and NCOEFF are on the first line
    if (lines[0] && lines[0].includes("KSIZE") && lines[0].includes("NCOEFF")) {
      const line = lines[0].trim();
      const match = line.match(/KSIZE=\s*(\d+)\s*NCOEFF=\s*(\d+)/);
      if (match) {
        this.constants.KSIZE = parseInt(match[1], 10);
        this.constants.NCOEFF = parseInt(match[2], 10);
        console.log(`Found in first line: KSIZE: ${this.constants.KSIZE}, NCOEFF: ${this.constants.NCOEFF}`);
        ksizeFound = true;
      }
    }

    // If not found in first line, try looking through all lines
    if (!ksizeFound) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        let match = line.match(/KSIZE=\s*(\d+)\s*NCOEFF=\s*(\d+)/);
        if (match) {
          this.constants.KSIZE = parseInt(match[1], 10);
          this.constants.NCOEFF = parseInt(match[2], 10);
          console.log(`Found in line ${i+1}: KSIZE: ${this.constants.KSIZE}, NCOEFF: ${this.constants.NCOEFF}`);
          ksizeFound = true;
          break;
        }
        
        // Alternative format without equals sign
        match = line.match(/KSIZE\s+(\d+)\s+NCOEFF\s+(\d+)/);
        if (match) {
          this.constants.KSIZE = parseInt(match[1], 10);
          this.constants.NCOEFF = parseInt(match[2], 10);
          console.log(`Found in line ${i+1}: KSIZE: ${this.constants.KSIZE}, NCOEFF: ${this.constants.NCOEFF}`);
          ksizeFound = true;
          break;
        }
      }
    }

    if (!ksizeFound) {
      console.warn('Could not parse KSIZE and NCOEFF values. Using default values.');
      this.constants.KSIZE = 2036;  // Default values based on DE440
      this.constants.NCOEFF = 1018;
      console.log(`Using default values - KSIZE: ${this.constants.KSIZE}, NCOEFF: ${this.constants.NCOEFF}`);
    }

    // Parse JPL Planetary Ephemeris info
    let ephemerisFound = false;
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      const match = line.match(/JPL Planetary Ephemeris (.*)/);
      if (match) {
        this.constants.EPHEMERIS_NAME = match[1];
        console.log(`Ephemeris: ${this.constants.EPHEMERIS_NAME}`);
        ephemerisFound = true;
        break;
      }
    }

    // Parse epoch dates
    let epochFound = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const startMatch = line.match(/Start Epoch:\s*(?:JED=)?\s*(\d+\.\d+)\s+(.*)/);
      if (startMatch) {
        this.constants.START_JD = parseFloat(startMatch[1]);
        this.constants.START_DATE = startMatch[2];
        console.log(`Start epoch: JD ${this.constants.START_JD} (${this.constants.START_DATE})`);
        
        // Look for end epoch in next few lines
        for (let j = i + 1; j < i + 3 && j < lines.length; j++) {
          const endLine = lines[j].trim();
          if (!endLine) continue;
          
          const endMatch = endLine.match(/(?:Final|End) Epoch:\s*(?:JED=)?\s*(\d+\.\d+)\s+(.*)/);
          if (endMatch) {
            this.constants.END_JD = parseFloat(endMatch[1]);
            this.constants.END_DATE = endMatch[2];
            console.log(`End epoch: JD ${this.constants.END_JD} (${this.constants.END_DATE})`);
            epochFound = true;
            break;
          }
        }
        
        if (epochFound) break;
      }
    }
  }

  /**
   * Parse the time constants group (1030)
   * @param {Array<string>} lines - Lines in the group
   */
  parseTimeConstantsGroup(lines) {
    if (!lines || lines.length === 0) {
      console.warn('Time constants group is empty or not found.');
      return;
    }

    // Extract the three time constants
    const values = lines[0].trim().split(/\s+/).map(parseFloat);
    if (values.length >= 3) {
      this.constants.START_JD_DATA = values[0];
      this.constants.END_JD_DATA = values[1];
      this.constants.DAYS_PER_BLOCK = values[2];
      console.log(`Data time range: ${this.constants.START_JD_DATA} to ${this.constants.END_JD_DATA}`);
      console.log(`Days per block: ${this.constants.DAYS_PER_BLOCK}`);
    } else {
      console.warn('Failed to parse time constants from group 1030.');
    }
  }

  /**
   * Parse the constant names group (1040)
   * @param {Array<string>} lines - Lines in the group
   */
  parseConstantNamesGroup(lines) {
    if (!lines || lines.length === 0) {
      console.warn('Constant names group is empty or not found.');
      return;
    }

    // First line contains the number of constants
    const numConstants = parseInt(lines[0].trim(), 10);
    console.log(`Number of constants: ${numConstants}`);

    // Store the constant names
    this.constantNames = [];
    for (let i = 1; i < lines.length; i++) {
      const names = lines[i].trim().split(/\s+/);
      this.constantNames.push(...names);
    }
  }

  /**
   * Parse the constant values group (1041)
   * @param {Array<string>} lines - Lines in the group
   */
  parseConstantValuesGroup(lines) {
    if (!lines || lines.length === 0 || !this.constantNames) {
      console.warn('Constant values group is empty or not found, or constant names are not parsed yet.');
      return;
    }

    // First line contains the number of constants (should match the 1040 group)
    const numConstants = parseInt(lines[0].trim(), 10);
    
    // Parse the constant values
    const values = [];
    for (let i = 1; i < lines.length; i++) {
      const lineValues = lines[i].trim().split(/\s+/).map(str => parseScientificNotation(str));
      values.push(...lineValues);
    }

    // Map constant names to their values
    for (let i = 0; i < Math.min(this.constantNames.length, values.length); i++) {
      this.constants[this.constantNames[i]] = values[i];
    }

    console.log(`Parsed ${Object.keys(this.constants).length} constants.`);
  }

  /**
   * Parse the coefficient info group (1050)
   * @param {Array<string>} lines - Lines in the group
   */
  parseCoefficientInfoGroup(lines) {
    if (!lines || lines.length < 3) {
      console.warn('Coefficient info group is empty or too short.');
      return;
    }

    // Parse the three sets of coefficients
    const sets = [];
    for (let i = 0; i < 3; i++) {
      const values = lines[i].trim().split(/\s+/).map(val => parseInt(val, 10));
      sets.push(values);
    }

    // Organize the coefficient info for each body
    for (let i = 0; i < 15; i++) {  // 15 bodies/items as per the format
      const info = {
        startIdx: sets[0][i],      // Starting location in data record
        coeffCount: sets[1][i],    // Number of coefficients per component
        setCount: sets[2][i]       // Number of coefficient sets in each record
      };
      
      this.coefficientInfo.push(info);
      
      if (info.setCount > 0) {
        console.log(`Body ${BODY_NAMES[i]}: ${info.coeffCount} coefficients per component, ${info.setCount} sets per record`);
      }
    }
  }

  /**
   * Parse data records from multiple data files, with an optional target date
   * @param {string|Array<string>} dataFilePaths - Path(s) to data file(s) or a glob pattern
   * @param {number} [targetDate] - Optional specific Julian date to search for
   * @returns {Array} - Parsed data records
   */
  async parseDataFiles(dataFilePaths, targetDate = null) {
    let filesToParse = [];
    
    // Handle both single file, array of files, or glob pattern
    if (typeof dataFilePaths === 'string') {
      // Check if it's a glob pattern
      if (dataFilePaths.includes('*')) {
        filesToParse = await findFiles(dataFilePaths);
        console.log(`Found ${filesToParse.length} files matching pattern: ${dataFilePaths}`);
      } else {
        filesToParse = [dataFilePaths];
      }
    } else if (Array.isArray(dataFilePaths)) {
      filesToParse = dataFilePaths;
    } else {
      throw new Error('Invalid data file specification. Must be a string path, glob pattern, or array of paths.');
    }
    
    // Sort files to ensure chronological ordering
    filesToParse = sortFilesByDatePattern(filesToParse);
    
    // If we have a target date, let's try to find the most relevant file first
    if (targetDate !== null) {
      console.log(`Looking for records containing Julian date ${targetDate}`);
      
      // Try to estimate which file might contain the date based on file naming
      // This assumes files are named with a pattern like "ascp01550.440" where the
      // number indicates a date range
      
      // Simple naive approach: try files in order until we find one with records
      // containing our target date
      for (const filePath of filesToParse) {
        console.log(`Checking if ${filePath} contains date ${targetDate}...`);
        
        try {
          const data = await readFile(filePath, 'utf8');
          
          // Quick check if this file might contain our date
          // Look at the first few record headers to get date ranges
          const lines = data.split('\n');
          let foundDateRange = false;
          let headerFound = false;
          let earliestJD = Infinity;
          let latestJD = -Infinity;
          
          // Scan first 100 lines to find date ranges
          for (let i = 0; i < Math.min(100, lines.length); i++) {
            const line = lines[i].trim();
            
            // Look for record header
            if (/^\s*\d+\s+\d+\s*$/.test(line)) {
              headerFound = true;
              
              // Look at next line for date range
              if (i + 1 < lines.length) {
                const dateLine = lines[i + 1].trim();
                const dateValues = dateLine.split(/\s+/);
                
                if (dateValues.length >= 2) {
                  try {
                    const startJD = parseScientificNotation(dateValues[0]);
                    const endJD = parseScientificNotation(dateValues[1]);
                    
                    if (!isNaN(startJD) && !isNaN(endJD)) {
                      // Update earliest and latest dates
                      earliestJD = Math.min(earliestJD, startJD);
                      latestJD = Math.max(latestJD, endJD);
                      
                      // Check if target date is in this range
                      if (targetDate >= startJD && targetDate <= endJD) {
                        console.log(`Found target date ${targetDate} in file ${filePath}!`);
                        foundDateRange = true;
                        break;
                      }
                    }
                  } catch (error) {
                    // Ignore parsing errors
                  }
                }
              }
            }
          }
          
          // If the file contains our target date, parse just this file
          if (foundDateRange) {
            console.log(`Parsing ${filePath} which contains target date ${targetDate}`);
            const records = await this.parseDataFile(filePath);
            
            // Find the specific record with our target date
            const targetRecord = records.find(rec => targetDate >= rec.startJD && targetDate <= rec.endJD);
            
            if (targetRecord) {
              console.log(`Found record containing target date ${targetDate}: JD ${targetRecord.startJD} to ${targetRecord.endJD}`);
              return [targetRecord]; // Return just this one record for efficiency
            } else {
              console.warn(`Could not find specific record for date ${targetDate} even though file should contain it`);
            }
          } else if (headerFound) {
            // If we found headers but not our date, see if our date is before or after this file's range
            console.log(`File ${filePath} covers JD ${earliestJD} to ${latestJD}`);
            
            if (targetDate < earliestJD) {
              console.log(`Target date ${targetDate} is before this file's range, searching earlier files...`);
              // Continue to next file
            } else if (targetDate > latestJD) {
              console.log(`Target date ${targetDate} is after this file's range, searching later files...`);
              // Continue to next file
            } else {
              // Date should be in this file but we didn't find it in our quick scan
              // Do a full parse of this file
              console.log(`Target date ${targetDate} appears to be within file's range, doing full parse...`);
              const records = await this.parseDataFile(filePath);
              
              // Find the specific record with our target date
              const targetRecord = records.find(rec => targetDate >= rec.startJD && targetDate <= rec.endJD);
              
              if (targetRecord) {
                console.log(`Found record containing target date ${targetDate}: JD ${targetRecord.startJD} to ${targetRecord.endJD}`);
                return [targetRecord]; // Return just this one record for efficiency
              }
            }
          }
        } catch (error) {
          console.error(`Error checking file ${filePath}: ${error.message}`);
        }
      }
      
      // If we get here, we didn't find a file with our target date
      console.warn(`Could not find a file containing target date ${targetDate}. Falling back to standard parsing.`);
    }
    
    // Parse each file and collect all records
    const allDataRecords = [];
    for (const filePath of filesToParse) {
      console.log(`Parsing data file: ${filePath}`);
      
      try {
        const records = await this.parseDataFile(filePath);
        allDataRecords.push(...records);
        
        // If we're looking for a specific date and found it, we can stop parsing
        if (targetDate !== null && allDataRecords.some(rec => targetDate >= rec.startJD && targetDate <= rec.endJD)) {
          console.log(`Found record containing target date ${targetDate}, stopping further parsing.`);
          
          // Filter to just return the target record for efficiency
          const targetRecord = allDataRecords.find(rec => targetDate >= rec.startJD && targetDate <= rec.endJD);
          if (targetRecord) {
            return [targetRecord];
          }
          
          break;
        }
      } catch (error) {
        console.error(`Error parsing file ${filePath}: ${error.message}`);
      }
    }
    
    // Sort all records by start date to ensure chronological order
    allDataRecords.sort((a, b) => a.startJD - b.startJD);
    
    // Check for overlapping or duplicate records
    this.deduplicateAndValidateRecords(allDataRecords);
    
    console.log(`Total data records parsed: ${allDataRecords.length}`);
    
    if (allDataRecords.length === 0) {
      console.error("No data records found in the provided files.");
    }
    
    return allDataRecords;
  }
  
  /**
   * Check for overlapping or duplicate records and handle them appropriately
   * @param {Array} records - Data records to validate
   */
  deduplicateAndValidateRecords(records) {
    if (records.length <= 1) return;
    
    // Sort records by startJD if not already sorted
    records.sort((a, b) => a.startJD - b.startJD);
    
    // Check for overlapping records
    for (let i = 0; i < records.length - 1; i++) {
      const current = records[i];
      const next = records[i + 1];
      
      // Check for exact duplicates
      if (current.startJD === next.startJD && current.endJD === next.endJD) {
        console.warn(`Duplicate record found for JD range [${current.startJD}, ${current.endJD}]. Removing duplicate.`);
        records.splice(i + 1, 1);
        i--; // Adjust index after removal
        continue;
      }
      
      // Check for overlapping records
      if (current.endJD > next.startJD) {
        console.warn(`Overlapping records found: [${current.startJD}, ${current.endJD}] and [${next.startJD}, ${next.endJD}]`);
        
        // Choose how to handle overlaps:
        // 1. Keep both (might have redundant data)
        // 2. Adjust boundaries (risks data inconsistency)
        // 3. Keep one (risks losing unique data)
        
        // For now, we'll keep the first record as is and adjust the second record to start after the first one
        console.warn(`Adjusting second record to start after the first one ends.`);
        next.startJD = current.endJD;
        
        // If this makes the record invalid, remove it
        if (next.startJD >= next.endJD) {
          console.warn(`Record becomes invalid after adjustment. Removing it.`);
          records.splice(i + 1, 1);
          i--; // Adjust index after removal
        }
      }
    }
  }

  /**
   * Parse a single data file
   * @param {string} filePath - Path to the data file
   * @returns {Array} - Parsed data records
   */
  async parseDataFile(filePath) {
    try {
      const data = await readFile(filePath, 'utf8');
      
      // First, try to parse as standard DE440 ASCII format
      const groups = this.splitIntoGroups(data.split('\n'));
      
      // Check if this file has GROUP 1070 data
      if (groups[GROUPS.DATA] && groups[GROUPS.DATA].length > 0) {
        // Parse as standard DE440 format
        const fileRecords = this.parseDataRecords(groups[GROUPS.DATA]);
        console.log(`Parsed ${fileRecords.length} data records from GROUP 1070 in ${filePath}`);
        return fileRecords;
      } else {
        // Try to parse as ASCP format
        console.log(`No GROUP 1070 found in ${filePath}. Trying to parse as ASCP format...`);
        const fileRecords = this.parseDirectDataFormat(data);
        
        if (fileRecords.length > 0) {
          console.log(`Successfully parsed ${fileRecords.length} records from ASCP format in ${filePath}`);
          return fileRecords;
        } else {
          console.warn(`Could not parse any records from ${filePath}`);
          return [];
        }
      }
    } catch (error) {
      console.error(`Error parsing file ${filePath}: ${error.message}`);
      return [];
    }
  }

  /**
   * Find the data record that contains a specific Julian date
   * @param {number} julianDate - Julian date to find
   * @param {Array} dataRecords - Array of parsed data records
   * @returns {Object|null} - The data record containing the date, or null if not found
   */
  findRecordForDate(julianDate, dataRecords) {
    // First try a binary search for efficiency with large datasets
    let left = 0;
    let right = dataRecords.length - 1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const record = dataRecords[mid];
      
      if (julianDate >= record.startJD && julianDate <= record.endJD) {
        console.log(`Found date ${julianDate} in record ${record.recordNumber || mid+1} (JD ${record.startJD} to ${record.endJD})`);
        return record;
      }
      
      if (julianDate < record.startJD) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    
    // If binary search fails, try a linear search as a fallback
    console.log(`Binary search failed for date ${julianDate}, trying linear search...`);
    
    for (const record of dataRecords) {
      if (julianDate >= record.startJD && julianDate <= record.endJD) {
        console.log(`Found date ${julianDate} in record ${record.recordNumber || 'unknown'} (JD ${record.startJD} to ${record.endJD})`);
        return record;
      }
    }
    
    console.warn(`No record found containing Julian date ${julianDate}`);
    return null;
  }

/**
   * Parse standard DE440 data records
   * @param {Array<string>} lines - Lines from the data group
   * @returns {Array} - Array of data records
   */
parseDataRecords(lines) {
    const dataRecords = [];
    let currentRecord = null;
    let recordCount = 0;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Check if this line contains Julian dates (start of a new record)
      if (trimmedLine.match(/^\d+\.\d+\s+\d+\.\d+/)) {
        // If we have a current record, push it to the records array
        if (currentRecord) {
          dataRecords.push(currentRecord);
        }
        
        // Start a new record
        recordCount++;
        const dates = trimmedLine.split(/\s+/).map(parseFloat);
        currentRecord = {
          startJD: dates[0],
          endJD: dates[1],
          recordNumber: recordCount,
          coefficients: []
        };
      } else if (currentRecord) {
        // Add coefficients to the current record
        const coeffs = trimmedLine.split(/\s+/)
          .filter(str => str)
          .map(str => parseScientificNotation(str));
        
        currentRecord.coefficients.push(...coeffs);
      }
    }
    
    // Add the last record if there is one
    if (currentRecord) {
      dataRecords.push(currentRecord);
    }
    
    return dataRecords;
  }

  /**
   * Parse a file directly as data records (ASCP format)
   * @param {string} fileContent - Content of the file
   * @returns {Array} - Parsed data records
   */
  parseDirectDataFormat(fileContent) {
    const records = [];
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    // Get the file structure first
    const recordStructure = [];
    let recordIndex = 0;
    
    // First, identify all header lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^\s*\d+\s+\d+\s*$/.test(line)) {
        recordStructure.push({
          headerLine: i,
          recordNumber: ++recordIndex,
          headerText: line
        });
      }
    }
    
    // Add end lines for each record
    for (let i = 0; i < recordStructure.length; i++) {
      recordStructure[i].endLine = i < recordStructure.length - 1 
        ? recordStructure[i+1].headerLine - 1
        : lines.length - 1;
    }
    
    console.log(`Found ${recordStructure.length} record headers in the file.`);
    
    // Now process each record
    for (let recordInfo of recordStructure) {
      try {
        // The header is at headerLine
        if (recordInfo.recordNumber % 50 === 0) {
          console.log(`Processing record ${recordInfo.recordNumber}: ${recordInfo.headerText}`);
        }
        
        // The date line is at headerLine + 1
        const dateLine = lines[recordInfo.headerLine + 1];
        
        // Parse the Julian dates from the date line
        // For the actual content in the ASCP files, we know the dates are the first 
        // two values on the second line in D notation
        const dateValues = dateLine.trim().split(/\s+/);
        if (dateValues.length >= 2) {
          const startJDStr = dateValues[0];
          const endJDStr = dateValues[1];
          
          const startJD = parseScientificNotation(startJDStr);
          const endJD = parseScientificNotation(endJDStr);
          
          if (!isNaN(startJD) && !isNaN(endJD)) {
            // Create a new record
            const record = {
              startJD,
              endJD,
              recordNumber: recordInfo.recordNumber,
              coefficients: []
            };
            
            if (recordInfo.recordNumber % 50 === 0) {
              console.log(`Record ${recordInfo.recordNumber} spans JD ${startJD} to ${endJD}`);
            } else if (recordInfo.recordNumber <= 20) {
              // Show details for the first 20 records
              console.log(`Record ${recordInfo.recordNumber} spans JD ${startJD} to ${endJD}`);
            }
            
            // The coefficients start at the date line
            // In the ASCP format, the first two values on the date line are dates,
            // but the rest of the line and all subsequent lines are coefficients
            
            // First add coefficients from the date line (skipping the first two values)
            for (let i = 2; i < dateValues.length; i++) {
              const coefficient = parseScientificNotation(dateValues[i]);
              if (!isNaN(coefficient)) {
                record.coefficients.push(coefficient);
              }
            }
            
            // Now add coefficients from all remaining lines in this record
            for (let i = recordInfo.headerLine + 2; i <= recordInfo.endLine; i++) {
              const coeffLine = lines[i].trim();
              const coeffValues = coeffLine.split(/\s+/).map(str => parseScientificNotation(str));
              
              for (const coeff of coeffValues) {
                if (!isNaN(coeff)) {
                  record.coefficients.push(coeff);
                }
              }
            }
            
            // Add the record to our collection
            records.push(record);
            
            // Provide feedback every 50 records to avoid too much console output
            if (recordInfo.recordNumber % 50 === 0) {
              console.log(`Processed ${recordInfo.recordNumber} records so far...`);
            }
          } else {
            console.warn(`Could not parse Julian dates from line: ${dateLine}`);
          }
        } else {
          console.warn(`Date line does not contain enough values: ${dateLine}`);
        }
      } catch (error) {
        console.error(`Error processing record ${recordInfo.recordNumber}: ${error.message}`);
      }
    }
    
    console.log(`Successfully parsed ${records.length} records with a total of ${records.reduce((sum, rec) => sum + rec.coefficients.length, 0)} coefficients`);
    
    return records;
  }

  /**
   * Compute the position of a body at a specific Julian date
   * @param {number} bodyId - ID of the body
   * @param {number} julianDate - Julian date
   * @param {Array} dataRecords - Parsed data records
   * @returns {Object} - Position and velocity vectors
   */
  computeBodyPosition(bodyId, julianDate, dataRecords) {
    // Find the data record that contains this Julian date
    const record = this.findRecordForDate(julianDate, dataRecords);
    
    if (!record) {
      throw new Error(`No data record found for Julian date ${julianDate}`);
    }
    
    // Get the coefficient info for this body
    const bodyInfo = this.coefficientInfo[bodyId];
    if (!bodyInfo || bodyInfo.setCount === 0) {
      throw new Error(`No coefficient info found for body ID ${bodyId}`);
    }
    
    // Calculate which set of coefficients to use within this record
    const recordSpan = (record.endJD - record.startJD) / bodyInfo.setCount;
    const setIndex = Math.floor((julianDate - record.startJD) / recordSpan);
    
    // Calculate the normalized time for this set
    const setStartJD = record.startJD + setIndex * recordSpan;
    const setEndJD = setStartJD + recordSpan;
    const normalizedTime = normalizeTime(julianDate, setStartJD, setEndJD);
    
    // Calculate the starting index for this body's coefficients
    const bodyStartIdx = bodyInfo.startIdx - 1; // Convert from 1-indexed to 0-indexed
    
    // Calculate the starting index for this set of coefficients
    const setStartIdx = bodyStartIdx + setIndex * bodyInfo.coeffCount * COMPONENTS_COUNT[bodyId];
    
    // Make sure we don't go beyond the coefficient array bounds
    if (setStartIdx + bodyInfo.coeffCount * COMPONENTS_COUNT[bodyId] > record.coefficients.length) {
      console.error(`Error: Coefficient index out of bounds. Record has ${record.coefficients.length} coefficients, trying to access index up to ${setStartIdx + bodyInfo.coeffCount * COMPONENTS_COUNT[bodyId] - 1}`);
      throw new Error(`Coefficient index out of bounds for body ${BODY_NAMES[bodyId]}`);
    }
    
    // Compute position for each component
    const position = [];
    for (let component = 0; component < COMPONENTS_COUNT[bodyId]; component++) {
      const coeffStartIdx = setStartIdx + component * bodyInfo.coeffCount;
      
      // Make sure we don't go beyond the coefficient array bounds
      if (coeffStartIdx + bodyInfo.coeffCount > record.coefficients.length) {
        console.error(`Error: Coefficient index out of bounds. Record has ${record.coefficients.length} coefficients, trying to access index up to ${coeffStartIdx + bodyInfo.coeffCount - 1}`);
        throw new Error(`Coefficient index out of bounds for body ${BODY_NAMES[bodyId]}, component ${component}`);
      }
      
      const coeffs = record.coefficients.slice(coeffStartIdx, coeffStartIdx + bodyInfo.coeffCount);
      
      // Evaluate the Chebyshev polynomial
      const value = evaluateChebyshev(coeffs, normalizedTime);
      position.push(value);
    }
    
    // Create the result object
    const result = {};
    COMPONENT_NAMES[bodyId].forEach((name, i) => {
      result[name] = position[i];
    });
    
    return result;
  }
}

module.exports = DE440Parser;