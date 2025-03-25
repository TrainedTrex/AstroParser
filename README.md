# DE440 Ephemeris Parser

A JavaScript parser for NASA's DE440 ephemeris data format, supporting multiple file formats including both standard ASCII format and binary files.

## Overview

This tool parses NASA's DE440 ephemeris data files and computes the positions of celestial bodies at specified dates. The Development Eph# DE440 Ephemeris Parser

A JavaScript parser for NASA's DE440 ephemeris data format.

## Overview

This tool parses NASA's DE440 ephemeris data files and computes the positions of celestial bodies at specified dates. The Development Ephemeris (DE) series contains high-precision orbital data for planets, moons, and other objects in our solar system.

## Features

- Parse DE440 header and data files in ASCII format
- Support multiple data files with chronological ordering
- Extract constants and metadata from the ephemeris
- Compute positions of celestial bodies using Chebyshev polynomial interpolation
- Output results in JSON or CSV format
- Flexible command-line interface and configuration options

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/de440-parser.git
   cd de440-parser
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Place your DE440 data files in the `data/` directory or specify their location in the config file.

## Usage

### Basic usage:

```
node src/index.js
```

This will use the default configuration in `config.json`.

### Command-line options:

```
node src/index.js [options]
```

Options:
- `-c, --config <path>`: Path to config file (default: `./config.json`)
- `-i, --input <paths>`: Path(s) to input data file(s) (comma-separated list, glob pattern like `./data/*.440`, or single file)
- `-h, --header <path>`: Path to header file
- `-o, --output <path>`: Path to output directory
- `-f, --format <format>`: Output format (json, csv)
- `-b, --body <body>`: Specific body to process (e.g., "mars", "sun")
- `-d, --date <date>`: Specific date to compute (in JD or YYYY-MM-DD format)
- `-v, --verbose`: Enable verbose output

### Examples:

Parse ascp files for DE440:
```
node src/index.js --input "./data/ascp*.440" --header "./data/header.440.txt"
```

Calculate Mars position at a specific date:
```
node src/index.js --body mars --date 2020-01-01 --input "./data/ascp*.440"
```

Output position data for all planets as CSV:
```
node src/index.js --format csv --input "./data/ascp*.440"
```

Process specific data files:
```
node src/index.js --input "./data/ascp01550.440,./data/ascp01650.440"
```

## Configuration

You can customize the parser by editing the `config.json` file:

```json
{
  "inputFiles": {
    "header": "./data/header.440",
    "dataFiles": ["./data/data1.440", "./data/data2.440"],
    "dataFilePattern": "./data/de440_*.440" 
  },
  "outputDir": "./output",
  "outputFormat": "json",
  "bodies": [
    "mercury",
    "venus",
    "earthMoonBarycenter",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
    "moon",
    "sun"
  ],
  "timeRange": {
    "start": null,
    "end": null
  },
  "logLevel": "info"
}
```

## File Format

The DE440 data is stored in ASCII format with several sections:

1. **Header (header.440)**: Contains metadata, constants, and coefficient information.
2. **Data (data.440)**: Contains Chebyshev polynomial coefficients for celestial body positions.

The parser reads these files and uses the Chebyshev polynomials to interpolate positions at specific points in time.

## Output

Results are output in the specified format (JSON or CSV) to the configured output directory. Each result includes:

- Body name
- Julian date
- Human-readable date
- Position components (x, y, z for planets)

## Resources

- [NASA JPL Planetary Ephemerides](https://ssd.jpl.nasa.gov/planets/ephemerides.html)
- [DE440/441 Release Notes](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aareadme_de440.txt)

## License

MIT