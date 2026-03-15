export default async function handler(req, res) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "API Key kosong di Environment Variable Vercel" });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        // Jika Google me-reject, kita kirimkan mentah-mentah agar bisa dibaca
        if (!response.ok) {
            return res.status(response.status).json({ 
                status: "Gagal", 
                detail_dari_google: data 
            });
        }

        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ status: "Error Server", pesan: error.message });
    }
    } 
