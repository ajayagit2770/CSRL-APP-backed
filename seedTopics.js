import mongoose from 'mongoose';
import './bootstrap-env.js';
import SyllabusTopics from './models/SyllabusTopics.js';

export const syllabusData = [
  {
    subject: "Physics",
    topics: [
      "Units & Dimensions",
      "Kinematics",
      "Projectile Motion",
      "Laws of Motion",
      "Circular Motion",
      "WPE (Work, Power, Energy) / Work-Energy Theorem",
      "WPE", 
      "Work-Energy Theorem",
      "Rotational Motion / Rotational Dynamics",
      "Rotational Motion", 
      "Rotational Dynamics",
      "Gravitation",
      "Elasticity",
      "Fluid Mechanics",
      "Thermal Expansion",
      "Thermodynamics",
      "Kinetic Theory",
      "SHM / Oscillations",
      "SHM",
      "Waves"
    ]
  },
  {
    subject: "Chemistry",
    topics: [
      "Some Basic Concepts of Chemistry",
      "Structure of Atom",
      "Classification of Elements & Periodicity",
      "Chemical Bonding & Molecular Structure",
      "Thermodynamics",
      "Equilibrium",
      "Redox Reactions",
      "p-Block Elements (Group 13 & 14)",
      "Organic Chemistry - Basic Principles",
      "Hydrocarbons"
    ]
  },
  {
    subject: "Mathematics",
    topics: [
      "Sets / Relation and function",
      "Complex Numbers and Quadratic Equations",
      "Sequences and Series",
      "Permutations and Combinations",
      "Binomial Theorem (including number theory/number patterns)",
      "Straight Lines",
      "Conic Sections (Circle, Parabola, Ellipse, Hyperbola)",
      "Trigonometric Functions",
      "Limits and Derivatives",
      "Probability",
      "Statistics"
    ]
  }
];

export async function seedTopics() {
  try {
    console.log("Seeding SyllabusTopics...");
    for (const item of syllabusData) {
      const doc = await SyllabusTopics.findOne({ subject: item.subject });
      if (doc) {
        // Merge topics, ensuring uniqueness
        const combined = new Set([...doc.topics, ...item.topics]);
        doc.topics = Array.from(combined);
        await doc.save();
        console.log(`Updated subject: ${item.subject} (${doc.topics.length} topics)`);
      } else {
        await SyllabusTopics.create({ subject: item.subject, topics: item.topics });
        console.log(`Created subject: ${item.subject} (${item.topics.length} topics)`);
      }
    }
    console.log("Seeding complete.");
  } catch (error) {
    console.error("Error seeding topics:", error);
  }
}
