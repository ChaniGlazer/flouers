require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');
//const fetch = require('node-fetch'); // npm install node-fetch

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// אינטגרציה עם OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// פונקציה לקבלת JSON מהמודל GPT-4
async function getFlowerData(description) {
  const systemMessage = `
אתה מעצב פרחים מקצועי. אתה מחזיר **רק JSON תקין** בלבד.
אין להוסיף טקסט או הסברים נוספים.
`;

  const userPrompt = `
קלט מהמשתמש: "${description}"
החזר JSON במבנה:
{
  "shopping_list": {
    "פרחים": { "שם פרח": כמות },
    "קישוטים": { "שם קישוט": כמות }
  },
  "arrangement_instructions": ["הוראה 1", "הוראה 2", ...],
  "image_prompt": "פרומפט ברור ומדויק ליצירת תמונה של הזר"
}
**חובה:** כל הפרחים והקישוטים חייבים להיות בצבעים שהמשתמש ביקש. אל תוסיף טקסט אחר.
`;

  let retries = 3;
  while (retries > 0) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7
    });

    const text = response.choices[0].message.content;
    try {
      return JSON.parse(text);
    } catch {
      retries--;
      if (retries === 0) throw new Error('לא הצלחנו לקבל JSON תקין מהמודל.');
    }
  }
}

// פונקציה ליצירת תמונה מ-Hugging Face Stable Diffusion
async function generateImageHuggingFace(prompt) {
  const response = await fetch(
    'https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: prompt })
    }
  );

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}

// נתיב יצירת זר
app.post('/generate', async (req, res) => {
  const description = req.body.description;

  try {
    const jsonOutput = await getFlowerData(description);

    // יצירת תמונה
    let imageUrl = '';
    if (jsonOutput.image_prompt) {
      imageUrl = await generateImageHuggingFace(jsonOutput.image_prompt);
    }

    // HTML קריא
    let htmlOutput = '<h3>רשימת פרחים:</h3><ul>';
    for (const [flower, qty] of Object.entries(jsonOutput.shopping_list.פרחים || {})) {
      htmlOutput += `<li>${flower}: ${qty}</li>`;
    }
    htmlOutput += '</ul><h3>קישוטים:</h3><ul>';
    for (const [decoration, qty] of Object.entries(jsonOutput.shopping_list.קישוטים || {})) {
      htmlOutput += `<li>${decoration}: ${qty}</li>`;
    }
    htmlOutput += '</ul><h3>הוראות סידור:</h3><ol>';
    for (const step of jsonOutput.arrangement_instructions || []) {
      htmlOutput += `<li>${step}</li>`;
    }
    htmlOutput += '</ol>';

    res.json({ html: htmlOutput, image: imageUrl });

  } catch (err) {
    console.error(err);
    res.json({ html: `<p>אירעה שגיאה: ${err.message}</p>` });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
