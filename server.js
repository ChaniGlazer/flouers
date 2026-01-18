require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// פונקציה לקבלת נתונים מ-OpenAI
async function getFlowerData(description) {
  console.log('➡️ שולחים בקשה ל-OpenAI');

 const systemMessage = `
אתה מעצב פרחים מומחה. עליך להחזיר JSON בלבד.

הנחיות מחמירות:
1. שמות פרחים: אל תכתוב רק צבע. בחר שמות של פרחים אמיתיים (למשל: ורדים, ליליות, דליות, ציפורנים).
2. התאמה לתמונה: ה-image_prompt חייב להכיל אך ורק את סוגי הפרחים שהופעת ב-shopping_list.
3. פירוט הוראות: חלק את ההוראות ל-4 שלבים:
   א. הכנת הפרחים (חיתוך, הסרת עלים).
   ב. בניית המבנה (בסיס ירוק).
   ג. שזירת הפרחים המרכזיים.
   ד. סגירה וקשירה.
4. שפת התמונה: ה-image_prompt חייב להיות באנגלית טכנית (למשל: "A single purple Dahlia surrounded by silver dollar eucalyptus, tied with twine, studio background").
`;

  const userPrompt = `
צור תוכנית לזר פרחים לפי התיאור: "${description}".

דרישות חובה ב-JSON:
- וודא שכל פרח שמופיע ב-image_prompt מופיע גם ב-shopping_list עם כמות מדויקת.
- אל תוסיף פרחים נוספים בתמונה שלא ביקשתי.
- ב-arrangement_instructions, תאר פעולות פיזיות (כמו "חתוך את הגבעולים ב-45 מעלות").
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

    let text = response.choices[0].message.content;
    // ניקוי תגיות Markdown אם קיימות
    text = text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  } catch (err) {
    console.error('❌ שגיאה ב-OpenAI:', err);
    throw err;
  }
}

// פונקציה ליצירת תמונה - מתוקנת
async function generateImageHuggingFace(prompt) {
  console.log('🎨 יוצרים תמונה ב-HuggingFace...');

  // שימוש בכתובת הישירה והמעודכנת של המודל
  const modelUrl = "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0";

  try {
    const response = await fetch(modelUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        inputs: prompt,
        options: { wait_for_model: true } 
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ שגיאה מהשרת:', errorText);
      // אם זה מחזיר 404, זה אומר שה-URL לא תקין או שהמודל לא זמין זמנית
      throw new Error(`HuggingFace error: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    console.log('✅ תמונה נוצרה בהצלחה');
    return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;

  } catch (err) {
    console.error('⚠️ כשל ביצירת תמונה:', err.message);
    throw err;
  }
}

// נתיב ה-API הראשי
app.post('/generate', async (req, res) => {
  console.log('📥 בקשה חדשה התקבלה');

  try {
    const jsonOutput = await getFlowerData(req.body.description);
    
    let imageUrl = '';
    if (jsonOutput.image_prompt) {
      try {
        imageUrl = await generateImageHuggingFace(jsonOutput.image_prompt);
      } catch (err) {
        imageUrl = ''; // ממשיכים בלי תמונה אם נכשל
      }
    }

    // בניית HTML
    let htmlOutput = '<h3>רשימת פרחים:</h3><ul>';
    for (const [flower, qty] of Object.entries(jsonOutput.shopping_list?.פרחים || {})) {
      htmlOutput += `<li>${flower}: ${qty}</li>`;
    }
    htmlOutput += '</ul><h3>הוראות סידור:</h3><ol>';
    for (const step of jsonOutput.arrangement_instructions || []) {
      htmlOutput += `<li>${step}</li>`;
    }
    htmlOutput += '</ol>';

    res.json({ html: htmlOutput, image: imageUrl });

  } catch (err) {
    res.status(500).json({ html: `<p>שגיאה: ${err.message}</p>`, image: '' });
  }
});

app.listen(3000, () => {
  console.log('🚀 Server is running on http://localhost:3000');
});