export default async function handler(req, res) {
    // Hanya menerima method POST dari Frontend
    if (req.method !== 'POST') {
        return res.status(405).json({ reply: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ reply: "🚨 ERROR VERCEL: GEMINI_API_KEY tidak ditemukan di Environment Variables Vercel." });
    }

    const { prompt, images, chatId, isTemp, systemInstructions } = req.body;
    let parts = [];

    // Logika deteksi permintaan gambar
    const isImageRequest = prompt && prompt.toLowerCase().startsWith('tolong buatkan gambar:');
    let effectivePrompt = prompt;

    if (isImageRequest) {
        effectivePrompt = `[IMAGE GENERATOR MODE] Create a highly detailed, high-quality, descriptive English prompt for an AI image generator based on this request: "${prompt.substring(22)}". Output ONLY the detailed English prompt text, nothing else.`;
    }

    if (effectivePrompt) {
        parts.push({ text: effectivePrompt });
    }

    // Handle Gambar (Base64) dari frontend
    if (images && images.length > 0) {
        images.forEach(imgBase64 => {
            const mimeType = imgBase64.split(';')[0].split(':')[1];
            const base64Data = imgBase64.split(',')[1];
            
            parts.push({
                inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                }
            });
        });
    }

    // FIX: Menggunakan Gemini 2.5 Flash sesuai models.json lo
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            
    let finalSystemPrompt = "Kamu adalah AI cerdas bernama ChatGPT buatan OpenAI (meskipun mesinmu Gemini). Gunakan bahasa Indonesia yang santai, natural, dan mudah dimengerti. Jika memberikan kode, berikan dalam format Markdown.";
    
    // Gabungkan dengan Personalisasi dari User jika ada
    if (systemInstructions && systemInstructions.trim() !== "") {
        finalSystemPrompt += `\n\n[USER PERSONALIZATION SETTINGS - PATUHI INI]:\n${systemInstructions}`;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: parts }],
                system_instruction: { parts: [{ text: finalSystemPrompt }] },
                generationConfig: {
                    temperature: isImageRequest ? 0.9 : 0.7,
                    maxOutputTokens: 2000,
                }
            })
        });

        const data = await response.json();

        // INI KUNCINYA: Tangkap Error Spesifik dari Google 
        if (!response.ok) {
            console.error("Gemini API Error:", data);
            return res.status(response.status).json({ 
                reply: `🚨 **GOOGLE API ERROR (${response.status})**: ${data.error?.message || JSON.stringify(data)}` 
            });
        }

        let rawText = data.candidates[0].content.parts[0].text;
        let finalReplyHTML = "";

        // HANDLING GENERATE GAMBAR
        if (isImageRequest) {
            const refinedPrompt = rawText.trim().replace(/\n/g, ' ');
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(refinedPrompt)}?nologo=true&enhance=true&width=1024&height=1024`;
            
            finalReplyHTML = `Gambar telah dibuat, Bos!<br><img src="${imageUrl}" style="width:100%; max-width:400px; border-radius:20px; margin-top:12px; border:1px solid var(--border-color); box-shadow: 0 4px 15px rgba(0,0,0,0.3);"><br><small style="color:var(--text-sub); font-size:11px; margin-top:4px; display:block;">Prompt Detail: ${refinedPrompt}</small>`;
        } else {
            // LOGIKA RENDER FRONTEND 
            let textParts = rawText.split(/```/);
            
            for (let i = 0; i < textParts.length; i++) {
                if (i % 2 === 0) {
                    textParts[i] = textParts[i].replace(/\n/g, '<br>');
                } else {
                    let lines = textParts[i].split('\n');
                    let lang = lines.shift() || 'code'; 
                    let codeContent = lines.join('\n').replace(/</g, '&lt;').replace(/>/g, '&gt;'); 
                    
                    textParts[i] = `
                    <div class="code-block">
                        <div class="code-header">
                            <span>${lang.trim()}</span>
                            <span class="copy-code-btn" onclick="copyCode(this)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg> Salin
                            </span>
                        </div>
                        <div class="code-content">${codeContent}</div>
                    </div>`;
                }
            }
            finalReplyHTML = textParts.join('');
        }

        return res.status(200).json({ reply: finalReplyHTML });

    } catch (error) {
        console.error("Vercel Server Error:", error);
        return res.status(500).json({ reply: `❌ **SERVER ERROR VERCEL**: ${error.message}` });
    }
        } 
