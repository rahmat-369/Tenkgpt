// File: api/chat.js

export default async function handler(req, res) {
    // Hanya menerima method POST dari Frontend
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ reply: "API Key Gemini belum disetting di Environment Variable Vercel." });
    }

    // UPDATE: Menangkap data dari Frontend termasuk systemInstructions (Personalisasi)
    const { prompt, images, chatId, isTemp, systemInstructions } = req.body;

    // Menyiapkan Payload Multimodal untuk Gemini 1.5 Flash
    let parts = [];

    // UPDATE LOGIKA: Cek apakah prompt meminta pembuatan gambar
    const isImageRequest = prompt && prompt.toLowerCase().startsWith('tolong buatkan gambar:');
    let effectivePrompt = prompt;

    if (isImageRequest) {
        // Trik: Minta Gemini buat prompt Inggris detail buat image generator
        effectivePrompt = `[SPECIAL INSTRUCTION] The user wants me to generate an image. Do not talk to the user directly. Instead, create a very detailed, descriptive, high-quality prompt in ENGLISH for an AI image generator based on this user request: "${prompt.substring(21)}". Output ONLY the detailed English prompt, nothing else.`;
    }

    // 1. Masukkan Teks Prompt
    parts.push({ text: effectivePrompt });

    // 2. Masukkan Gambar (Jika user melampirkan foto)
    if (images && images.length > 0) {
        images.forEach(imgBase64 => {
            const mimeType = imgBase64.split(';')[0].split(':')[1];
            const base64Data = imgBase64.split(',')[1];
            
            parts.push({
                inline_data: { mime_type: mimeType, data: base64Data }
            });
        });
    }

    // API URL menggunakan Gemini 1.5 Flash (Super cepat, support Text + Vision)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // UPDATE: Persona/System Instructions. Gabungkan instruksi default dan input user.
    let finalSystemPrompt = "Kamu adalah AI cerdas bernama ChatGPT buatan OpenAI (meskipun mesinmu Gemini). Gunakan bahasa Indonesia yang santai, natural, dan mudah dimengerti. Jika memberikan kode, berikan dalam format Markdown yang rapi.";
    
    // Jika user menginput instruksi khusus di menu Personalisasi, tambahkan ke prompt utama
    if (systemInstructions && systemInstructions.trim().length > 0) {
        finalSystemPrompt += `\n\n[USER PERSONALIZATION - HARUS DITURUTI]:\n${systemInstructions}`;
    }

    const systemInstructionPayload = {
        parts: [{ text: finalSystemPrompt }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: parts }],
                system_instruction: systemInstructionPayload,
                generationConfig: {
                    temperature: isImageRequest ? 0.9 : 0.7, // Lebih kreatif buat gambar
                    maxOutputTokens: 2000,
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Gemini API Error:", data);
            return res.status(response.status).json({ reply: "Maaf, terjadi kesalahan pada server API Gemini: " + (data.error?.message || "Unknown error") });
        }

        let rawText = data.candidates[0].content.parts[0].text;
        let finalReplyHTML = "";

        // ========================================================
        // HANDLING GENERATE GAMBAR (WORKAROUND GEMINI)
        // ========================================================
        if (isImageRequest) {
            // Bersihkan teks Gemini dari karakter aneh
            let refinedPrompt = rawText.trim().replace(/\n/g, ' ');
            
            // Menggunakan Pollinations.ai (Gratis, Multimodal-friendly)
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(refinedPrompt)}?nologo=true&private=true&enhance=true`;
            
            finalReplyHTML = `Gambar siap, Bos Rhmt!<br><img src="${imageUrl}" style="width:100%; max-width:380px; border-radius: 20px; margin-top:12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border: 2px solid var(--border-color);" alt="Generated Image"><br><small style="color:var(--text-sub); font-size:11px; margin-top:4px; display:block;">Prompt Detail: ${refinedPrompt}</small>`;
        } else {
            // ========================================================
            // LOGIKA RENDER FRONTEND (Mengubah Markdown jadi HTML UI)
            // ========================================================
            // Memisahkan teks biasa dan blok kode (```)
            let textParts = rawText.split(/```/);
            
            for (let i = 0; i < textParts.length; i++) {
                if (i % 2 === 0) {
                    // Ini teks biasa: Ubah spasi baris (\n) jadi <br>
                    textParts[i] = textParts[i].replace(/\n/g, '<br>');
                } else {
                    // Ini Blok Kode: Bungkus dengan struktur HTML "code-block" milik Frontend
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
        return res.status(500).json({ reply: "Maaf, backend Vercel mengalami gangguan jaringan." });
    }
                                     }
