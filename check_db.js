import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");
  const db = mongoose.connection.db;

  const topicMaps = await db.collection('topicmaps').countDocuments();
  console.log("TopicMaps count:", topicMaps);

  const studentRawMarks = await db.collection('studentrawmarks').countDocuments();
  console.log("StudentRawMarks count:", studentRawMarks);
  
  if (studentRawMarks > 0) {
    const sample = await db.collection('studentrawmarks').findOne({});
    console.log("Sample StudentRawMarks testId:", sample.testId, "centerId:", sample.centerId);
  }

  const studentWeakTopics = await db.collection('studentweaktopics').countDocuments();
  console.log("StudentWeakTopics count:", studentWeakTopics);

  const centerWeakTopics = await db.collection('centerweaktopics').countDocuments();
  console.log("CenterWeakTopics count:", centerWeakTopics);
  
  if (centerWeakTopics > 0) {
    const centers = await db.collection('centerweaktopics').find({}).toArray();
    centers.forEach(c => console.log("CenterWeakTopics doc:", c.centerId, c.testId));
  }

  process.exit(0);
}
check();
