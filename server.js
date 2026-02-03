require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
// const fetch = require('node-fetch');
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

async function saveImage(buffer, fileName) {
    const imagesDir = path.join(__dirname, 'public', 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    const filePath = path.join(imagesDir, fileName);
    await fs.promises.writeFile(filePath, buffer);
    console.log(`[LOG] Image saved locally: ${filePath}`);
    return `/images/${fileName}`;
}

async function uploadToCloudinary(buffer, fileName) {
    // יוצרים תיקייה זמנית אם לא קיימת
    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempPath = path.join(tempDir, fileName);
    await fs.promises.writeFile(tempPath, buffer);
    console.log(`[LOG] Saved temp image: ${tempPath}`);

    try {
        const result = await cloudinary.uploader.upload(tempPath, {
            folder: "bouquets",
            public_id: fileName.replace(/\.[^/.]+$/, ""),
            resource_type: "image",
            format: path.extname(fileName).replace(".", ""), // שומר את הפורמט המקורי
            overwrite: true
        });
        console.log("[LOG] Uploaded to Cloudinary:", result.secure_url);
        return result.secure_url;
    } finally {
        // מוחקים את הקובץ הזמני
        fs.unlinkSync(tempPath);
    }
}

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
    console.log("[LOG] Sending to OpenAI model:\n", description);

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: `צור תוכנית לזר: "${description}"` }
        ]
    });

    const text = response.choices[0].message.content;
    console.log("[LOG] Response from OpenAI model:\n", text);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("לא נמצא JSON תקין");
    return JSON.parse(jsonMatch[0]);
}

async function generateImageHuggingFace(prompt) {
    console.log("[LOG] Sending image prompt to HuggingFace:", prompt);

    const modelUrl = "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0";
    const response = await fetch(modelUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.HF_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } })
    });

    if (!response.ok) {
        console.error("[LOG] HuggingFace API error:", response.status);
        throw new Error(`HuggingFace error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = `bouquet_${Date.now()}.png`;

    const cloudUrl = await uploadToCloudinary(buffer, fileName);
    return cloudUrl;
}

app.post('/generate', async (req, res) => {
    console.log("[LOG] Received /generate request:", req.body);

    try {
        const jsonOutput = await getFlowerData(req.body.description);

        let imageUrl = '';
        if (jsonOutput.image_prompt) {
            try {
                imageUrl = await generateImageHuggingFace(jsonOutput.image_prompt);
            } catch (err) {
                console.error("[LOG] Continuing without image due to error:", err.message);
            }
        }

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

        console.log("[LOG] Sending response to frontend");

        res.json({ html: htmlOutput, image: imageUrl });

    } catch (err) {
        console.error("[LOG] Error in /generate:", err);
        res.status(500).json({ html: `<p>שגיאה בעיבוד הבקשה: ${err.message}</p>`, image: '' });
    }
});

app.get('/ping', (req, res) => res.status(200).send('ok'));

app.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
