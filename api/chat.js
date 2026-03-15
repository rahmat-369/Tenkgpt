export default async function handler(req, res) {
    // Hanya menerima method POST dari Frontend
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ reply: "API Key Gemini belum disetting di Environment Vercel." });
    }

    // Menangkap data dari Frontend (Teks, Gambar Base64, ChatID, Mode Sementara)
    const { prompt, images, chatId, isTemp } = req.body;

    // Menyiapkan Payload Multimodal untuk Gemini 1.5 Flash
    let parts = [];

    // 1. Masukkan Teks Prompt
    if (prompt) {
        parts.push({ text: prompt });
    }

    // 2. Masukkan Gambar (Jika user melampirkan foto)
    if (images && images.length > 0) {
        images.forEach(imgBase64 => {
            // Ekstrak tipe mime dan data base64 (contoh: "data:image/jpeg;base64,...")
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

    // API URL menggunakan Gemini 1.5 Flash (Super cepat, support Text + Vision)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // Persona/Karakteristik AI (Bisa lo ubah nanti sesuai fitur "Personalisasi")
    const systemInstruction = {
        parts: [{ text: "Kamu adalah AI cerdas bernama ChatGPT buatan OpenAI (meskipun mesinmu Gemini). Gunakan bahasa Indonesia yang santai, natural, dan mudah dimengerti. Jika memberikan kode, berikan dalam format Markdown." }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: parts }],
                system_instruction: systemInstruction,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2000,
                }
            })
        });

        const data = await response.json();

        // Handle error dari Google (misal API limit)
        if (!response.ok) {
            console.error("Gemini API Error:", data);
            return res.status(response.status).json({ reply: "Maaf, terjadi kesalahan pada server API Gemini: " + (data.error?.message || "Unknown error") });
        }

        let rawText = data.candidates[0].content.parts[0].text;

        // ========================================================
        // LOGIKA RENDER FRONTEND (Mengubah Markdown jadi HTML UI)
        // ========================================================
        // Memisahkan teks biasa dan blok kode (```)
        let textParts = rawText.split(/```/);
        
        for (let i = 0; i < textParts.length; i++) {
            if (i % 2 === 0) {
                // Ini teks biasa: Ubah spasi baris (\n) jadi <br> biar paragrafnya rapi di UI
                textParts[i] = textParts[i].replace(/\n/g, '<br>');
            } else {
                // Ini Blok Kode: Bungkus dengan struktur HTML "code-block" milik Frontend
                let lines = textParts[i].split('\n');
                let lang = lines.shift() || 'code'; // Ambil nama bahasa (javascript, html, dll)
                let codeContent = lines.join('\n').replace(/</g, '&lt;').replace(/>/g, '&gt;'); // Cegah injeksi HTML
                
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

        let finalReplyHTML = textParts.join('');

        // Kirim balasan yang sudah siap render ke Frontend
        return res.status(200).json({ reply: finalReplyHTML });

    } catch (error) {
        console.error("Vercel Server Error:", error);
        return res.status(500).json({ reply: "Maaf, backend Vercel mengalami gangguan jaringan." });
    }
}
