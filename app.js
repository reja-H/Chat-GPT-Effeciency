const express = require('express');
const mongoose = require('mongoose');
const https = require('https');

// Initialize the Express app
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json()); // To parse JSON request bodies

// MongoDB URI (securely stored; consider environment variables for production)
const mongoURI = "mongodb+srv://reja:blueSky12!@itec4020.gnwxo.mongodb.net/?retryWrites=true&w=majority&appName=Itec4020";

// OpenAI API Key (use environment variables in production)
const OPENAI_API_KEY = "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";

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: 'ChatGPT_Evaluation'
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1); // Exit the process with failure if connection fails
  }
};

// Start the server and connect to MongoDB
connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
});

// Define the schema for the questions
const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  anticipatedAnswer: String,
  chatGPTResponse: { type: String, default: null }, // Corrected type
} );

const CS_Model = mongoose.model('questions', questionSchema, 'Computer_Security');
const SS_Model = mongoose.model('questions', questionSchema, 'Social_Science');
const H_Model = mongoose.model('questions', questionSchema, 'History');

// Function to introduce a delay between API requests (useful for rate-limiting)
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Route to send questions to ChatGPT and store responses in MongoDB
app.post('/ask-chatgpt', async (req, res) => {
  try {
    // Retrieve all the questions that don't have a response yet
    const cs_questions = await CS_Model.find();
    const ss_questions = await SS_Model.find();
    const h_questions = await H_Model.find();
    const questions = [
      ...cs_questions,
      ...ss_questions,
      ...h_questions
    ]

    if (questions.length === 0) {
      return res.send('All questions have been answered.');
    }

    // Process each question
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

      // Ensure that questionText is not empty
      if (!question.question || question.question.trim() === '') {
        console.log('Skipping question because it is empty or invalid:', question);
        continue;
      }

      // Define the data for the API request to OpenAI
      const postData = JSON.stringify({
        model: 'gpt-3.5-turbo', // Or the latest available model
        messages: [{ role: 'user', content: question.question }],
        max_tokens: 150,
      });

      // Define the request options for the OpenAI API
      const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`, // Use OpenAI API key directly
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      // Make the HTTPS request
      const apiReq = https.request(options, (response) => {
        let data = '';

        // Collect the data from the response
        response.on('data', (chunk) => {
          data += chunk;
        });

        // Handle the full response
        response.on('end', async () => {
          try {
            // Log the raw API response to inspect its structure
            console.log('Raw API Response:', data);

            // Parse the response from OpenAI
            const parsedResponse = JSON.parse(data);
            console.log('Parsed Response:', parsedResponse);

            // Extract the chatGPTResponse from the parsed response
            const chatGPTResponse = parsedResponse.choices?.[0]?.message?.content?.trim();

            // If no valid response is found, log and skip this question
            if (!chatGPTResponse) {
              console.log('No valid response or empty content for question:', question.question);
              return; // Skip this question
            }

            // Save the response in the database
            question.chatGPTResponse = chatGPTResponse;
            await question.save();
            console.log(`Response saved for: ${question.question}`);

            // Optional delay to avoid hitting the API too quickly
            await delay(2000); // Delay for 2 seconds
          } catch (error) {
            console.error(`Error processing response for: ${question.question}`, error);
          }
        });
      });

      // Handle request errors
      apiReq.on('error', (error) => {
        console.error(`Request error for: ${question.question}`, error);
      });

      // Write the postData to the request body
      apiReq.write(postData);

      // End the request
      apiReq.end();
    }

    res.send('All questions have been processed.');
  } catch (err) {
    console.error('Error processing questions:', err);
    res.status(500).send('Error processing questions');
  }

//checking accuracy
const evaluateAccuracy = async () => {
  try {
    const cs_questions = await CS_Model.find({ chatgptResponse: { $exists: true }, anticipatedAnswer: { $exists: true } });

    let correctCount = 0;
    let totalCount = cs_questions.length;

    cs_questions.forEach((question) => {
      const chatgptResponse = cs_questions.chatgptResponse.trim();
      const anticipatedAnswer = cs_questions.anticipatedAnswer.trim();

      // Check for exact match (you can use more sophisticated methods like fuzzy matching or cosine similarity)
      if (chatgptResponse === anticipatedAnswer) {
        correctCount++;
      }
    });

    const accuracy = (correctCount / totalCount) * 100;
    console.log(`Accuracy: ${accuracy}%`);
  } catch (error) {
    console.error('Error during accuracy evaluation:', error);
    evaluateAccuracy()
  }
};


});
