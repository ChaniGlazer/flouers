require('dotenv').config();
// חשוב עבור סביבת 'אתרוג' אם יש שגיאות תעודה
if (process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const express = require('express');
const bodyParser = require('body-parser');
const { OpenAI } = require('openai');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000 // הגדלת זמן המתנה ל-60 שניות עבור חיבורים איטיים
});
async function getFlowerData(description) {
    console.log('➡️ שולחים בקשה ל-OpenAI');

    const systemMessage = `אתה מומחה מקצועי לעיצוב זרי פרחים ולפלוריסטיקה.
עליך להחזיר JSON תקני בלבד — ללא טקסט חופשי, ללא הסברים.

מבנה החובה:
{
  "shopping_list": {
    "פרחים": {},
    "קישוטים": {}
  },
  "arrangement_instructions": [],
  "image_prompt": ""
}

כללים מחייבים:
1. שמות פרחים אמיתיים ומוכרים בלבד.
2. בדיוק 4 שלבים ב-arrangement_instructions.
3. שפה:
   - shopping_list: עברית בלבד
   - arrangement_instructions: עברית בלבד
   - image_prompt: אנגלית בלבד
4. image_prompt:
   - תיאור ריאליסטי
   - מותאם ל-SDXL
   - ללא אנשים, ידיים, טקסט או לוגו
5. אין להוסיף שדות נוספים.
6. אין להוסיף טקסט מחוץ ל-JSON.

`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user', content: `צור תוכנית לזר: "${description}"` }
            ],
            temperature: 0.7
        });

        let text = response.choices[0].message.content;
        
        // חילוץ JSON בטוח למקרה שהמודל הוסיף טקסט חופשי
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("לא נמצא JSON תקין בתשובה");
        
        return JSON.parse(jsonMatch[0]);
    } catch (err) {
        console.error('❌ שגיאה ב-OpenAI:', err);
        throw err;
    }
}

async function generateImageHuggingFace(prompt) {
    console.log('🎨 יוצרים תמונה ב-HuggingFace...');
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
            throw new Error(`HuggingFace error: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
    } catch (err) {
        console.error('⚠️ כשל ביצירת תמונה:', err.message);
        throw err;
    }
}

app.post('/generate', async (req, res) => {
    console.log('📥 בקשה חדשה התקבלה');

    try {
        const jsonOutput = await getFlowerData(req.body.description);
        
        let imageUrl = '';
        if (jsonOutput.image_prompt) {
            try {
                imageUrl = await generateImageHuggingFace(jsonOutput.image_prompt);
            } catch (err) {
                console.log("ממשיכים ללא תמונה עקב שגיאה");
            }
        }

        // בניית HTML בטוחה למניעת שגיאת "not iterable"
        let htmlOutput = '<h3>רשימת פרחים:</h3><ul>';
        const flowerList = jsonOutput.shopping_list?.פרחים || {};
        const decorationList = jsonOutput.shopping_list?.קישוטים || {};
        
        // שימוש ב-Object.entries בטוח
        Object.entries(flowerList).forEach(([name, qty]) => {
            htmlOutput += `<li>${name}: ${qty}</li>`;
        });
        
        htmlOutput += '</ul><h3>קישוטים:</h3><ul>';
        Object.entries(decorationList).forEach(([name, qty]) => {
            htmlOutput += `<li>${name}: ${qty}</li>`;
        });

        htmlOutput += '</ul><h3>הוראות סידור:</h3><ol>';
        const steps = Array.isArray(jsonOutput.arrangement_instructions) ? jsonOutput.arrangement_instructions : [];
        steps.forEach(step => {
            htmlOutput += `<li>${step}</li>`;
        });
        htmlOutput += '</ol>';

        res.json({ html: htmlOutput, image: imageUrl });

    } catch (err) {
        console.error('🔥 שגיאה:', err);
        res.status(500).json({ html: `<p>שגיאה בעיבוד הבקשה: ${err.message}</p>`, image: '' });
    }
});
// פינג עצמי כל 10 דקות
const SERVER_URL = 'https://your-app-name.onrender.com'; // שנה לכתובת האמיתית שלך

setInterval(async () => {
    try {
        const response = await fetch(SERVER_URL);
        console.log(`Self-ping successful: Status ${response.status} at ${new Date().toISOString()}`);
    } catch (error) {
        console.error(`Self-ping failed: ${error.message}`);
    }
}, 10 * 60 * 1000); // 10 דקות במילישניות
app.listen(3000, () => {
    console.log('🚀 Server is running on http://localhost:3000');
});
