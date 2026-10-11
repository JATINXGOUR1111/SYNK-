"""All AI prompts P1-P12 (P13 feed ranking is computed in code). {placeholders} filled by fill()."""

def fill(template: str, **kw) -> str:
    for k, v in kw.items():
        template = template.replace("{" + k + "}", v if isinstance(v, str) else __import__("json").dumps(v, ensure_ascii=False))
    return template


COMMON = " Use only the data provided. Never invent tools, prices, deadlines, budgets or achievements. Return ONLY valid JSON."

P1 = ("You are an expert creative director who reviews AI-generated work. Analyze the attached "
      "{media_description}. Return ONLY valid JSON:\n"
      '{"medium":"image|video|audio|design|copy",\n'
      ' "style_tags":["max 5 e.g. cinematic, minimalist, anime, 3D, retro"],\n'
      ' "mood_tags":["max 3"],\n'
      ' "likely_tools":["only if visible evidence suggests it, else []"],\n'
      ' "industry_fit":["max 3 e.g. beauty, fashion, food, tech, real-estate"],\n'
      ' "best_use_cases":["e.g. Instagram reel, product ad, album cover"],\n'
      ' "quality_notes":"one sentence on technical quality and consistency",\n'
      ' "confidence":0.0-1.0}\n'
      "Do not guess tools when unsure. Do not describe real people by name.")

P2 = ("You write portfolio copy for AI creators. Input: creator name {name}, declared tools {tools}, "
      "industries {categories}, tags from their works {aggregated_tags}. Write: (1) a 2-sentence professional bio, "
      'confident, no hype words like "revolutionary"; (2) a headline of max 12 words; (3) three specialties bullets; '
      "(4) a 40-word ideal-client description. Use only the information provided. "
      'Return JSON: {"bio":"","headline":"","specialties":[],"ideal_client":""}')

P3 = ('You are a creative producer helping a brand write a clear brief. The brand wrote: "{rough_idea}". '
      "Identify which of these are missing or vague: goal, target audience, format, duration/size, tone, platform, "
      "deliverables count, budget, deadline, reference examples. Ask at most 4 short clarifying questions, most "
      "important first, in simple language, with 2-3 example answers each. If the idea is already detailed enough, "
      'return {"questions":[]}.\nReturn JSON: {"questions":[{"q":"","examples":["",""]}]}')

P4 = ("Convert the brand's idea and answers into a structured creative brief.\nIdea: {rough_idea}. Answers: {answers}. "
      "Return ONLY JSON:\n"
      '{"title":"","goal":"","target_audience":"","format":"video|image|audio|mixed","platform":"",\n'
      ' "duration_or_size":"","tone_and_style":[],"deliverables":[{"type":"","quantity":0}],\n'
      ' "budget_range_inr":{"min":0,"max":0},"deadline_days":0,"preferred_tools":[],"must_have":[],\n'
      ' "avoid":[],"search_summary":"60-word plain-text description used for embedding"}\n'
      "Use null for anything unknown. Never invent budget or deadline.")

P5 = ('Convert a brand\'s search sentence into filters plus a semantic query.\nSearch: "{query}". Return ONLY JSON:\n'
      '{"semantic_query":"cleaned phrase for embedding",\n'
      ' "filters":{"category":null,"tools":[],"max_budget_inr":null,"max_turnaround_days":null,\n'
      '            "medium":null}}\nOnly set a filter if the user clearly stated it.')

P6 = ("You are a matching assistant for a creative marketplace. Brief: {structured_brief_json}. Creator profile: "
      "{creator_summary}. Most relevant pieces: {top_3_pieces_with_tags}. Match score: {score_breakdown}. "
      "Write a 2-3 sentence explanation for the brand of why this creator fits. Rules: mention specific evidence "
      "(a piece, a tool, a style) from the data; mention one possible gap or risk honestly (for example price above "
      "budget); no exaggeration, no claims not supported by the data.\n"
      'Return JSON: {"why_match":"","strengths":["",""],"watch_out":""}')

P7 = ("Draft a short proposal from a creator to a brand. Brief: {brief_json}. Creator: {creator_profile}. "
      "Write 120 words max: a one-line opening that shows you understood the goal, your approach in 3 bullets "
      "(tools + workflow), delivery timeline, and a price within the brand's budget. Friendly, professional tone.\n"
      'Return JSON: {"proposal_text":"","suggested_price_inr":0,"timeline_days":0}')

P8 = ("Review this creator's submission for marketplace trust. Declared tools: {tools}. Description: {description}. "
      "Flag if any seem present: famous brand logos or characters, imitation of a living artist's named style, "
      'claims of "100% original" with no tools disclosed, content that may violate copyright. Return JSON:\n'
      '{"risk_level":"low|medium|high","flags":[],"recommendation":""}\n'
      "This is a screening aid only, not a legal judgment.")

P9 = ("Suggest a fair price range in INR for this brief. Brief: {brief_json}. Reference prices of similar "
      "creators/projects: {price_samples}. Return JSON:\n"
      '{"low":0,"mid":0,"high":0,"reasoning":"2 sentences"}\nBase the numbers only on the samples provided.')

P10 = ("From this brief, write 4 distinct image-generation prompts showing different visual directions (different "
       "mood, colour palette, composition). Brief: {brief_json}. Return JSON:\n"
       '{"concepts":[{"name":"","image_prompt":"","palette":["#hex","#hex","#hex"]}]}')

P11 = ("You write engaging social captions for AI creators. Input: post title {title}, description {description}, "
       "tools {tools}, tags from P1 {tags}. Write one caption of max 40 words in an authentic, non-spammy voice, "
       "optionally one emoji, plus 5-8 relevant hashtags (no spaces, lowercase, no banned or misleading tags). "
       'Do not claim awards or results not provided. Return JSON: {"caption":"","hashtags":["#..."]}')

P12 = ("Classify this user-generated text/image for a professional creative marketplace. Flag hate, harassment, "
       "sexual content, scams, spam, personal data leaks, and attempts to move payment off-platform. "
       'Return JSON: {"allowed":true|false,"category":"","reason":""}')

RULES = ("\nGeneral rules: return strict JSON only (no markdown); use only the data provided; never invent tools, "
         "prices, deadlines, budgets or achievements.")
