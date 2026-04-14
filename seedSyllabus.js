/**
 * seedSyllabus.js
 * One-time script to populate SyllabusTopics collection.
 *
 * Usage: node seedSyllabus.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import SyllabusTopics from './models/SyllabusTopics.js';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in .env');
  process.exit(1);
}

const SYLLABUS = [
  {
    subject: 'Physics',
    topics: [
      'General Physics',
      'Kinematics',
      'Laws of Motion and Circular Motion',
      'Work Power and Energy',
      'Center of Mass and Collisions',
      'Rotation',
      'Elasticity',
      'Thermal Physics',
      'SHM',
      'Waves',
      'Electrostatics',
      'Gravitation',
      'Capacitors',
      'Current Electricity',
      'Magnetism',
      'EMI and AC Currents',
      'Modern Physics',
      'Experimental Skills',
      'EM Waves',
      'Semiconductors',
      'Geometric Optics',
      'Wave Optics',
      'Fluids',
    ],
  },
  {
    subject: 'Chemistry',
    topics: [
      'Stoichiometry and Redox Reaction',
      'Atomic Structure',
      'Periodic Properties',
      'Chemical Bonding',
      'Isomerism',
      'Reaction Mechanism',
      'Hydrocarbons',
      'Alkyl and Aryl Halide',
      'Alcohols Phenols and Ethers',
      'Aldehydes and Ketones',
      'Carboxylic Acids',
      'Amines',
      'Biomolecules',
      'Principles Related to Practical Chemistry and Practical Organic Chemistry',
      'Coordination Compounds',
      'd and f Block Elements',
      'Qualitative Analysis',
      'Chemical and Ionic Equilibrium',
      'Thermodynamics and Thermochemistry',
      'Solutions',
      'Electrochemistry',
      'Chemical Kinetics',
      'Gaseous State',
      'Solid State',
      'Hydrogen and s Block Elements',
      'p Block Elements',
      'Ores and Metallurgy',
      'Surface Chemistry',
      'Polymers',
      'Chemistry in Everyday Life',
    ],
  },
  {
    subject: 'Mathematics',
    topics: [
      'Basic Maths Sets and Relation Basic Inequality Logarithm Functions Graphs Greatest Integer Function',
      'Quadratic Equations',
      'Sequences and Series',
      'Straight Lines and Pair of Straight Lines',
      'Circle',
      'Parabola',
      'Ellipse',
      'Hyperbola',
      'Complex Numbers',
      'Matrices and Determinants',
      'Vectors',
      '3D Geometry',
      'Inverse Trigonometric Function',
      'Limits Continuity and Differentiation',
      'Application of Derivatives',
      'Indefinite Integration',
      'Definite Integration',
      'Area',
      'Differential Equations',
      'Statistics',
      'P and C',
      'Probability',
      'Binomial Theorem',
      'Trigonometry',
    ],
  },
];

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected');

    // Delete existing SyllabusTopics documents
    await SyllabusTopics.deleteMany({});
    console.log('🗑️  Cleared existing SyllabusTopics');

    // Insert new documents
    const result = await SyllabusTopics.insertMany(SYLLABUS);
    console.log(`✅ Inserted ${result.length} SyllabusTopics documents:`);
    result.forEach((doc) => {
      console.log(`   - ${doc.subject}: ${doc.topics.length} topics`);
    });

    await mongoose.disconnect();
    console.log('✅ Done. MongoDB disconnected.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

seed();
