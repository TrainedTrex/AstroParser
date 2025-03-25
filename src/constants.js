/**
 * Constants for the DE440 ephemeris parser
 */

// Reference frames
const REFERENCE_FRAMES = {
    ICRF: 'ICRF',             // International Celestial Reference Frame (default)
    ECLIPTIC_J2000: 'ECLIPTIC_J2000' // Ecliptic plane at J2000.0 epoch
  };
  
  // Coordinate centers
  const COORDINATE_CENTERS = {
    SSB: 'SSB',               // Solar System Barycenter (default)
    SUN: 'SUN',               // Sun-centered
    EARTH: 'EARTH'            // Earth-centered
  };
  
  // Ephemeris bodies indices in the DE440 file
  const BODIES = {
    MERCURY: 0,
    VENUS: 1,
    EARTH_MOON_BARYCENTER: 2,
    MARS: 3,
    JUPITER: 4,
    SATURN: 5,
    URANUS: 6,
    NEPTUNE: 7,
    PLUTO: 8,
    MOON: 9,
    SUN: 10,
    NUTATIONS: 11,
    LUNAR_LIBRATION: 12,
    LUNAR_ANGULAR_VELOCITY: 13,
    TT_TDB: 14
  };
  
  // Body names mapping for display and output
  const BODY_NAMES = {
    [BODIES.MERCURY]: 'Mercury',
    [BODIES.VENUS]: 'Venus',
    [BODIES.EARTH_MOON_BARYCENTER]: 'Earth-Moon Barycenter',
    [BODIES.MARS]: 'Mars',
    [BODIES.JUPITER]: 'Jupiter',
    [BODIES.SATURN]: 'Saturn',
    [BODIES.URANUS]: 'Uranus',
    [BODIES.NEPTUNE]: 'Neptune',
    [BODIES.PLUTO]: 'Pluto',
    [BODIES.MOON]: 'Moon',
    [BODIES.SUN]: 'Sun',
    [BODIES.NUTATIONS]: 'Nutations',
    [BODIES.LUNAR_LIBRATION]: 'Lunar Libration',
    [BODIES.LUNAR_ANGULAR_VELOCITY]: 'Lunar Angular Velocity',
    [BODIES.TT_TDB]: 'TT-TDB'
  };
  
  // Units for each body data
  const UNITS = {
    [BODIES.MERCURY]: 'km',
    [BODIES.VENUS]: 'km',
    [BODIES.EARTH_MOON_BARYCENTER]: 'km',
    [BODIES.MARS]: 'km',
    [BODIES.JUPITER]: 'km',
    [BODIES.SATURN]: 'km',
    [BODIES.URANUS]: 'km',
    [BODIES.NEPTUNE]: 'km',
    [BODIES.PLUTO]: 'km',
    [BODIES.MOON]: 'km',
    [BODIES.SUN]: 'km',
    [BODIES.NUTATIONS]: 'radians',
    [BODIES.LUNAR_LIBRATION]: 'radians',
    [BODIES.LUNAR_ANGULAR_VELOCITY]: 'radians/day',
    [BODIES.TT_TDB]: 'seconds'
  };
  
  // Number of components for each body
  const COMPONENTS_COUNT = {
    [BODIES.MERCURY]: 3,               // x, y, z
    [BODIES.VENUS]: 3,                 // x, y, z
    [BODIES.EARTH_MOON_BARYCENTER]: 3, // x, y, z
    [BODIES.MARS]: 3,                  // x, y, z
    [BODIES.JUPITER]: 3,               // x, y, z
    [BODIES.SATURN]: 3,                // x, y, z
    [BODIES.URANUS]: 3,                // x, y, z
    [BODIES.NEPTUNE]: 3,               // x, y, z
    [BODIES.PLUTO]: 3,                 // x, y, z
    [BODIES.MOON]: 3,                  // x, y, z
    [BODIES.SUN]: 3,                   // x, y, z
    [BODIES.NUTATIONS]: 2,             // dPsi, dEpsilon
    [BODIES.LUNAR_LIBRATION]: 3,       // phi, theta, psi
    [BODIES.LUNAR_ANGULAR_VELOCITY]: 3, // omega_x, omega_y, omega_z
    [BODIES.TT_TDB]: 1                 // TT-TDB
  };
  
  // Component names for each body
  const COMPONENT_NAMES = {
    [BODIES.MERCURY]: ['x', 'y', 'z'],
    [BODIES.VENUS]: ['x', 'y', 'z'],
    [BODIES.EARTH_MOON_BARYCENTER]: ['x', 'y', 'z'],
    [BODIES.MARS]: ['x', 'y', 'z'],
    [BODIES.JUPITER]: ['x', 'y', 'z'],
    [BODIES.SATURN]: ['x', 'y', 'z'],
    [BODIES.URANUS]: ['x', 'y', 'z'],
    [BODIES.NEPTUNE]: ['x', 'y', 'z'],
    [BODIES.PLUTO]: ['x', 'y', 'z'],
    [BODIES.MOON]: ['x', 'y', 'z'],
    [BODIES.SUN]: ['x', 'y', 'z'],
    [BODIES.NUTATIONS]: ['dPsi', 'dEpsilon'],
    [BODIES.LUNAR_LIBRATION]: ['phi', 'theta', 'psi'],
    [BODIES.LUNAR_ANGULAR_VELOCITY]: ['omega_x', 'omega_y', 'omega_z'],
    [BODIES.TT_TDB]: ['tt_tdb']
  };
  
  // Group identifiers in the ASCII file
  const GROUPS = {
    KSIZE: '1010',
    TIME_CONSTANTS: '1030',
    CONSTANT_NAMES: '1040',
    CONSTANT_VALUES: '1041',
    COEFFICIENT_INFO: '1050',
    DATA: '1070'
  };
  
  module.exports = {
    BODIES,
    BODY_NAMES,
    UNITS,
    COMPONENTS_COUNT,
    COMPONENT_NAMES,
    GROUPS,
    REFERENCE_FRAMES,
    COORDINATE_CENTERS
  };