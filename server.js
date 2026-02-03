require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
//const fetch = require('node-fetch');
const { OpenAI } = require('openai');
const cloudinary = require('cloudinary').v2;

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// הגדרת Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/* פונקציה לשמירת התמונה בשרת (למקרה שתרצה לשמור ל־public, אבל לא חובה) */
async function saveImage(buffer, fileName) {
    const imagesDir = path.join(__dirname, 'public', 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    const filePath = path.join(imagesDir, fileName);
    await fs.promises.writeFile(filePath, buffer);
    return `/images/${fileName}`;
}

/* פונקציה ל־Cloudinary */
async function uploadToCloudinary(buffer, fileName) {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            { folder: "bouquets", public_id: fileName.replace(/\.[^/.]+$/, "") },
            (error, result) => {
                if (error) return reject(error);
                resolve(result.secure_url);
            }
        ).end(buffer);
    });
}

/* פונקציה ליצירת נתוני הזר */
async function getFlowerData(description) {
    const systemMessage = `
אתה מומחה פלוריסטיקה.
החזר JSON בלבד:
{
  "shopping_list": { "פרחים": {}, "קישוטים": {} },
  "arrangement_instructions": [],
  "image_prompt": ""
}
`;
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: `צור תוכנית לזר: "${description}"` }
        ]
    });

    const text = response.choices[0].message.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("לא נמצא JSON תקין");
    return JSON.parse(jsonMatch[0]);
}

/* פונקציה ליצירת התמונה והעלאה ל־Cloudinary */
async function generateImageHuggingFace(prompt) {
    const modelUrl = "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0";
    const response = await fetch(modelUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.HF_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } })
    });

    if (!response.ok) throw new Error(`HuggingFace error: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `bouquet_${Date.now()}.png`;

    // מעלים ל‑Cloudinary
    const cloudUrl = await uploadToCloudinary(buffer, fileName);
    return cloudUrl; // מחזיר URL ל־Frontend
}

/* ניהול בקשות יצירת זר */
app.post('/generate', async (req, res) => {
    try {
        const jsonOutput = await getFlowerData(req.body.description);

        let imageUrl = '';
        if (jsonOutput.image_prompt) {
            try {
                imageUrl = await generateImageHuggingFace(jsonOutput.image_prompt);
            } catch (err) {
                console.log("ממשיכים ללא תמונה עקב שגיאה:", err.message);
            }
        }

        // בניית HTML להצגה
        let htmlOutput = '<h3>רשימת פרחים:</h3><ul>';
        Object.entries(jsonOutput.shopping_list?.פרחים || {}).forEach(([name, qty]) => {
            htmlOutput += `<li>${name}: ${qty}</li>`;
        });
        htmlOutput += '</ul><h3>קישוטים:</h3><ul>';
        Object.entries(jsonOutput.shopping_list?.קישוטים || {}).forEach(([name, qty]) => {
            htmlOutput += `<li>${name}: ${qty}</li>`;
        });
        htmlOutput += '</ul><h3>הוראות סידור:</h3><ol>';
        (jsonOutput.arrangement_instructions || []).forEach(step => htmlOutput += `<li>${step}</li>`);
        htmlOutput += '</ol>';

        res.json({ html: htmlOutput, image: imageUrl });

    } catch (err) {
        res.status(500).json({ html: `<p>שגיאה בעיבוד הבקשה: ${err.message}</p>`, image: '' });
    }
});

app.get('/ping', (req, res) => res.status(200).send('ok'));

app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
