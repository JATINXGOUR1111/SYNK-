TOOLS = ["Midjourney", "Runway", "Sora", "Pika", "Kling", "Luma", "Stable Diffusion", "DALL-E", "Firefly",
         "ElevenLabs", "Suno", "Udio", "HeyGen", "Synthesia", "ComfyUI", "Leonardo", "Veo", "Flux", "Ideogram",
         "CapCut", "Canva", "Figma", "ChatGPT", "Claude", "Adobe Premiere", "After Effects", "Photoshop"]
CATEGORIES = ["beauty", "fashion", "food", "tech", "fintech", "real-estate", "jewellery", "travel",
              "fitness", "education", "gaming", "music", "automotive", "healthcare", "ecommerce", "packaging",
              "wellness", "entertainment", "retail", "d2c"]
CATEGORY_SYNONYMS = {"skincare": "beauty", "wellness-beauty": "beauty", "cosmetics": "beauty", "makeup": "beauty", "jewelry": "jewellery",
                     "jewellery": "jewellery", "finance": "fintech", "banking": "fintech", "realty": "real-estate",
                     "property": "real-estate", "restaurant": "food", "cafe": "food", "saas": "tech",
                     "app": "tech", "clothing": "fashion", "apparel": "fashion", "gym": "fitness"}
STYLES = ["cinematic", "minimalist", "anime", "3d", "retro", "vibrant", "moody", "surreal", "photorealistic",
          "illustrated", "vintage", "futuristic", "luxury", "playful", "clean", "editorial", "neon", "pastel"]
MOODS = ["cheerful", "calm", "energetic", "elegant", "dramatic", "warm", "bold", "dreamy", "nostalgic", "fresh"]
USE_CASES = {"reel": "Instagram reel", "ad": "product ad", "album": "album cover", "poster": "poster",
             "jingle": "audio jingle", "shoot": "product shoot", "logo": "brand identity", "packaging": "packaging"}
MEDIUM_WORDS = {"video": ["video", "reel", "film", "clip", "animation", "motion", "commercial"],
                "audio": ["audio", "music", "jingle", "voiceover", "song", "podcast", "sound"],
                "image": ["image", "photo", "shoot", "render", "poster", "illustration", "product shoot"],
                "design": ["design", "logo", "packaging", "brand identity", "layout", "ui"]}
BANNED_WORDS = ["fuck", "bitch", "slut", "porn", "nude", "nigger", "kill yourself", "rape", "cunt"]
SCAM_PHRASES = ["pay outside", "outside the platform", "off-platform", "whatsapp me", "send me upi",
                "paytm me", "bank transfer directly", "crypto wallet", "telegram me", "gpay me", "pay me directly",
                "guaranteed income", "double your money", "click this link", "free followers", "dm me for money"]
BRAND_RISK = ["disney", "marvel", "pokemon", "nike logo", "mickey", "spiderman", "batman", "pixar", "ghibli style",
              "coca-cola logo", "apple logo", "harry potter", "star wars"]
LIVING_ARTIST_RE = r"(in the style of|style of|inspired by|à la)\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?"
