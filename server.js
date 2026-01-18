require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// אינטגרציה עם OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// פונקציה לקבלת JSON מהמודל GPT-4 עם הוראות מפורטות
async function getFlowerData(description) {
  console.log('➡️ שולחים בקשה ל-OpenAI עם תיאור:', description);

  const systemMessage = `
אתה מעצב פרחים מקצועי. אתה מחזיר **רק JSON תקין** בלבד.
אין להוסיף טקסט או הסברים נוספים.
מבנה JSON חייב לכלול:
- shopping_list: רשימת פרחים וקישוטים עם כמויות
- arrangement_instructions: מערך הוראות סידור מפורטות של הזר
- image_prompt: פרומפט ברור ליצירת תמונה
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

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7
    });

    const text = response.choices[0].message.content;

    console.log('✅ התקבלה תשובה מ-OpenAI');
    console.log('📝 תוכן התשובה הגולמי:', text);

    // המודל מחזיר JSON – מנסה לפרסר
    return JSON.parse(text);

  } catch (err) {
    console.error('❌ שגיאה בתקשורת עם OpenAI:', err);
    throw err;
  }
}

// פונקציה ליצירת תמונה מ-Hugging Face Stable Diffusion
async function generateImageHuggingFace(prompt) {
  console.log('🎨 יוצרים תמונה עם prompt:', prompt);

  const response = await fetch(
    'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2',

    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: prompt })
    }
  );

  console.log('📡 סטטוס תגובת HuggingFace:', response.status);

  if (!response.ok) {
    const text = await response.text();
    console.error('❌ שגיאה מ-HuggingFace:', text);
    throw new Error('Hugging Face request failed');
  }

  const buffer = await response.arrayBuffer();
  console.log('✅ תמונה התקבלה בהצלחה');

  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/png;base64,${base64}`;
}

// נתיב יצירת זר
app.post('/generate', async (req, res) => {
  console.log('📥 בקשה חדשה /generate');
  console.log('תיאור שהתקבל מהמשתמש:', req.body.description);

  const description = req.body.description;

  try {
    const jsonOutput = await getFlowerData(description);
    console.log('📦 JSON שהתקבל מהמודל:', jsonOutput);

    let imageUrl = '';
    if (jsonOutput.image_prompt) {
      console.log('🖼 מתחילים יצירת תמונה');
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
    console.error('🔥 שגיאה בטיפול בבקשה /generate:', err);
    res.json({ html: `<p>אירעה שגיאה: ${err.message}</p>` });
  }
});

app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
