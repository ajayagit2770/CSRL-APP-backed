import mongoose from 'mongoose';
import './bootstrap-env.js';
import SyllabusTopics from './models/SyllabusTopics.js';

export const syllabusData = [
  {
    subject: "Physics",
    topics: [
      "General Physics and Experimental skills",
      "Kinematics",
      "Laws of Motion, Friction",
      "Circular motion",
      "Work, Power & Energy",
      "Center of Mass & Collisions",
      "Rotation",
      "SHM",
      "WAVES",
      "Electrostatics",
      "Gravitation",
      "Capacitors",
      "Current Electricity",
      "EM Waves",
      "Wave Optics",
      "Geometric Optics",
      "Modern Physics",
      "Semi Conductors",
      "Magnetic effect of current",
      "Magnetism",
      "EMI",
      "AC",
      "Thermal Physics",
      "Elasticity",
      "Fluid"
    ]
  },
  {
    subject: "Chemistry",
    topics: [
      "CLASS XIth Revision",
      "CLASS XIIth Revision",
      "Some Basic Concepts of Chemistry",
      "Redox reactions",
      "Solutions",
      "Atomic Structure",
      "Classification of elements & periodicity in properties",
      "Chemical Bonding & Molecular Structure",
      "Coordination Compounds",
      "d & f Block elements",
      "Chemical Kinetics",
      "Purification & Characterisation of Organic Compounds",
      "Some Basic Principles of Organic Chemistry-Nomenclature, Fundamental Concepts, Reaction Intermediates, Reaction Mechanism",
      "Isomerism - Structural & Stereoisomerism",
      "Hydrocarbons-Alkanes, Alkenes, Alkynes & Aromatic Hydrocarbons",
      "Organic compounds containing Halogens-Haloalkanes & Haloarenes",
      "Organic compounds containing oxygen-Alcohols, Phenols & Ethers, Aldehydes & Ketones, Carboxylic Acids",
      "Organic compounds containing Nitrogen-Amines & Diazonium Salts",
      "Biomolecules",
      "Chemical Thermodynamics",
      "Chemical Equilibrium",
      "Ionic Equilibrium",
      "Electrochemistry",
      "p Block Elements",
      "Principles Related to Practical Chemistry-Inorganic & Organic",
      "States of Matter Gases & Liquids",
      "Solid State",
      "Hydrogen & s Block Elements",
      "Isolation of Metals",
      "Surface Chemistry",
      "Polymers",
      "Environmental Chemistry",
      "Chemistry in everyday life"
    ]
  },
  {
    subject: "Mathematics",
    topics: [
      "Basic Maths, Sets & Relation(Basic trigonometry, Inequalities, Modulus, Logarithm, Functions & graphs, Greatest integer Function, Surds & indices.)",
      "Quadratic Equations",
      "Sequence & Series",
      "Trigonometric Identities, Equations & Inequalities: Properties & Solutions of Triangles",
      "Binomial Theorem",
      "Matrices & Determinants",
      "Straight Lines and Pair of Straight Lines",
      "Circles",
      "Parabola",
      "Ellipse & Hyperbola",
      "Vectors",
      "3-D Geometry",
      "Statistics",
      "Inverse trigonometric & Function",
      "Limits, Continuity & Differentiability",
      "MOD, Application of Derivatives",
      "Indefinite Integration",
      "Definite Integeration",
      "Area",
      "Differential Equations",
      "Complex Numbers",
      "P & C",
      "Probability"
    ]
  }
];

export async function seedTopics() {
  try {
    console.log("Seeding SyllabusTopics (overwriting old data)...");
    
    // Delete existing topics first to ensure we use the unique new list
    await SyllabusTopics.deleteMany({});
    console.log("Cleared existing SyllabusTopics from DB.");

    for (const item of syllabusData) {
      await SyllabusTopics.create({ subject: item.subject, topics: item.topics });
      console.log(`Created subject: ${item.subject} (${item.topics.length} topics)`);
    }
    console.log("Seeding complete.");
  } catch (error) {
    console.error("Error seeding topics:", error);
  }
}
