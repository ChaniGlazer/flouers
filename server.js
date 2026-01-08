require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');  // <-- רק OpenAI

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// יצירת מופע OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post('/generate', async (req, res) => {
  const userInput = req.body.description;

  const prompt = `
  קלט מהמשתמש: "${userInput}"
  החזר בצורה ברורה:
  1. רשימת פרחים וקישוטים לקנייה כולל כמות.
  2. הוראות סידור של הזר שלב-שלב.
  3. פרומפט מדויק ליצירת תמונה של הזר (למודל AI).
  מבנה הפלט: JSON עם keys: shopping_list, arrangement_instructions, image_prompt
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });

    res.send(response.choices[0].message.content);
  } catch (err) {
    console.error(err);
    res.send("אירעה שגיאה בעת יצירת הזר.");
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
