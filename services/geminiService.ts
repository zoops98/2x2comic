
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { FullScript, Character, ContinuationType, StoryFormat } from '../types';

let dynamicApiKey: string | null = null;

export function setDynamicApiKey(key: string) {
  dynamicApiKey = key;
}

// Helper to create a new AI client instance with the latest API key
function getAIClient() {
  const key = dynamicApiKey || process.env.API_KEY;
  if (!key) {
    throw new Error("API 키가 설정되지 않았습니다. 설정에서 API 키를 입력해주세요.");
  }
  return new GoogleGenAI({ apiKey: key });
}

const scriptSchema = {
  type: Type.OBJECT,
  properties: {
    characters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["name", "description"]
      },
    },
    panels: {
      type: Type.ARRAY,
      description: "반드시 4개의 패널로 구성된 배열이어야 합니다.",
      minItems: 4,
      maxItems: 4,
      items: {
        type: Type.OBJECT,
        properties: {
          panel: { type: Type.NUMBER },
          character: { type: Type.STRING },
          description: { type: Type.STRING },
          dialogue: { type: Type.STRING },
        },
        required: ["panel", "character", "description", "dialogue"],
      },
    },
  },
  required: ["characters", "panels"],
};

const ideasSchema = {
  type: Type.OBJECT,
  properties: {
    ideas: {
      type: Type.ARRAY,
      description: "반드시 5개의 아이디어로 구성된 배열이어야 합니다.",
      minItems: 5,
      maxItems: 5,
      items: {
        type: Type.STRING,
        description: "만화 주제 아이디어"
      }
    }
  },
  required: ["ideas"]
};

const instagramPostSchema = {
  type: Type.OBJECT,
  properties: {
    description: {
      type: Type.STRING,
      description: "인스타그램 게시물을 위한 감성적이고 매력적인 설명글. 이모지를 적절히 사용해주세요."
    },
    hashtags: {
      type: Type.STRING,
      description: "해시 기호(#)로 시작하고 공백으로 구분된 관련 해시태그 문자열. (예: #공부스타그램 #모의고사 #지문이해)"
    },
  },
  required: ["description", "hashtags"],
};


function getIdeasPrompt(): string {
  return `
  당신은 교육 전문가이자 창의적인 4컷 만화 아이디어 제안자입니다.
  모의고사 지문이나 어려운 텍스트를 학습자가 더 쉽게 이해할 수 있도록 돕는 5가지 흥미로운 만화 구성 아이디어를 제안해주세요.

  # 규칙
  1. 각 아이디어는 지문의 핵심을 관통하는 명확한 시각화 컨셉이어야 합니다.
  2. 학습 동기를 유발할 수 있는 재미있는 상황 설정을 포함하세요.
  3. JSON 형식으로만 응답해야 합니다.
  `;
}

export async function generateIdeas(): Promise<string[]> {
  const prompt = getIdeasPrompt();
  const ai = getAIClient();

  const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
          responseMimeType: 'application/json',
          responseSchema: ideasSchema,
      },
  });

  const jsonText = response.text.trim();
  try {
      const parsed = JSON.parse(jsonText) as { ideas: string[] };
      return parsed.ideas;
  } catch (e) {
      console.error("Failed to parse ideas JSON:", jsonText);
      throw new Error("AI가 아이디어를 생성하는 도중 오류가 발생했습니다.");
  }
}

function getScriptPrompt(topic: string, storyFormat: StoryFormat): string {
  const baseRules = `
    # 역할
    당신은 복잡한 교육용 텍스트(모의고사, 비문학 등)를 4컷 만화로 재구성하는 **학습 시각화 전문가**입니다.
    사용자가 입력한 내용("${topic}")의 핵심 논리를 완벽하게 분석하여 기-승-전-결 구조로 만드세요.

    # 규칙
    1. **핵심 요약**: 지문의 가장 중요한 메시지가 반드시 마지막 컷에 드러나야 합니다.
    2. **캐릭터 활용**: 설명하는 캐릭터와 질문하는 캐릭터를 배치하여 대화 형식으로 내용을 풀어내면 이해가 쉽습니다.
    3. **이미지 묘사(description)**: 이미지 생성 AI가 정확하게 그릴 수 있도록 배경, 캐릭터의 표정, 소품 등을 구체적으로 영어 키워드를 섞어 작성하세요.
    4. **대사(dialogue)**: 어려운 개념을 쉬운 일상어로 치환하여 친절하게 설명하세요.
    5. JSON 형식으로만 응답해주세요.
  `;

  if (storyFormat === 'serial') {
    return baseRules + `\n# 이 이야기는 시리즈의 전반부입니다. 다음 내용을 기대하게 만드는 클리프행어로 마무리하세요.`;
  }
  return baseRules;
}


export async function generateScript(topic: string, storyFormat: StoryFormat): Promise<FullScript> {
  const prompt = getScriptPrompt(topic, storyFormat);
  const ai = getAIClient();

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
        responseMimeType: 'application/json',
        responseSchema: scriptSchema,
    },
  });

  const jsonText = response.text.trim();
  try {
    let cleanJsonText = jsonText;
    if (jsonText.startsWith('```json')) {
        cleanJsonText = jsonText.substring(7, jsonText.length - 3).trim();
    } else if (jsonText.startsWith('```')) {
        cleanJsonText = jsonText.substring(3, jsonText.length - 3).trim();
    }
    return JSON.parse(cleanJsonText) as FullScript;
  } catch (e) {
    console.error("Failed to parse script JSON:", jsonText);
    throw new Error("대본을 생성하는 중 데이터 형식이 잘못되었습니다.");
  }
}

function getInstagramPostPrompt(topic: string, script: FullScript): string {
  const scriptSummary = script.panels.map(p => `컷 ${p.panel}: ${p.description} ${p.dialogue}`).join('\n');

  return `
  당신은 어려운 공부 내용을 카드뉴스로 공유하는 교육 인플루언서입니다.
  아래 4컷 만화 내용을 바탕으로 학습에 도움이 되는 피드 설명을 작성하세요.

  # 만화 정보
  - 지문 주제: ${topic}
  - 내용 요약:
  ${scriptSummary}

  # 규칙
  1. **설명 (description)**: 요약과 질문을 포함해 친절하게 작성하세요.
  2. **해시태그 (hashtags)**: #4컷만화 #모의고사 #공부자극 등을 포함하세요.
  3. JSON 형식으로만 응답해야 합니다.
  `;
}

export async function generateInstagramPost(topic: string, script: FullScript): Promise<{ description: string; hashtags: string; }> {
  const prompt = getInstagramPostPrompt(topic, script);
  const ai = getAIClient();

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: instagramPostSchema,
    },
  });

  const jsonText = response.text.trim();
  try {
    return JSON.parse(jsonText) as { description: string; hashtags: string; };
  } catch (e) {
    throw new Error("포스트 생성 실패");
  }
}

function getImageStylePrompt(style: string): { styleGuide: string, outputFormat: string, role: string } {
    const commonOutputFormat = `
      *   Full-color digital illustration
      *   NO TEXT inside the image.
    `;

    const styleMap: Record<string, { role: string, styleGuide: string, outputFormat?: string }> = {
        '아메리칸 코믹스': {
            role: "American superhero comics expert.",
            styleGuide: "Strong outlines, primary colors, dynamic angles, comic book aesthetic."
        },
        '한국 최신 웹툰': {
            role: "Modern Korean Webtoon artist.",
            styleGuide: "Soft lighting, beautiful character design, clean digital painting, high-quality webtoon style."
        },
        '린 클레어 (Ligne claire)': {
            role: "Ligne Claire master artist.",
            styleGuide: "Constant line width, flat colors, clear and precise backgrounds, Tintin-style."
        },
        'Detailed Illustration': {
            role: "Professional digital illustrator.",
            styleGuide: "Highly detailed, intricate textures, realistic lighting, polished finish."
        },
        'Architectural Sketch': {
            role: "Architectural illustrator.",
            styleGuide: "Precise lines, technical drawing style, blueprint-like details, clean and structured."
        },
        'Flat vector 1': {
            role: "Graphic designer.",
            styleGuide: "Minimalist flat vector style, bold colors, simple shapes, no gradients."
        },
        'Flat Vector 2': {
            role: "Modern UI illustrator.",
            styleGuide: "Flat vector style with subtle shadows and textures, modern corporate aesthetic."
        },
        'Watercolor': {
            role: "Watercolor painter.",
            styleGuide: "Soft edges, bleeding colors, paper texture, traditional watercolor medium feel."
        },
        'Charcoal Sketch': {
            role: "Fine art sketch artist.",
            styleGuide: "Rough charcoal textures, high contrast, smudged edges, hand-drawn look."
        },
        'Photo Comic': {
            role: "Cinematic photographer.",
            styleGuide: "Realistic photographic style, dramatic lighting, looks like a movie still in a comic layout."
        },
        'Fashion Illustration': {
            role: "Fashion illustrator.",
            styleGuide: "Elegant lines, stylish poses, emphasis on clothing and silhouette, chic aesthetic."
        },
        'Urban Sketch 1': {
            role: "Urban sketcher.",
            styleGuide: "Quick ink and wash style, loose lines, capturing city life and architecture."
        },
        'Urban Sketch 2': {
            role: "Street artist.",
            styleGuide: "Graffiti-inspired, bold markers, vibrant colors, urban energy."
        },
        'Urban Sketch 3': {
            role: "Travel journal artist.",
            styleGuide: "Detailed pen drawing with light watercolor washes, observational sketch style."
        },
        'Outline': {
            role: "Minimalist line artist.",
            styleGuide: "Pure line art, no shading, clean black outlines on white background."
        },
        'Graphic Novel': {
            role: "Noir graphic novel artist.",
            styleGuide: "High contrast, heavy shadows, gritty atmosphere, dramatic storytelling style."
        },
        'Contour Drawing': {
            role: "Art student.",
            styleGuide: "Continuous line drawing, focus on edges and shapes, artistic and raw."
        },
        'Caricature': {
            role: "Caricature artist.",
            styleGuide: "Exaggerated features, humorous proportions, expressive and funny."
        },
        'Japanese Manga': {
            role: "Manga artist.",
            styleGuide: "Classic Japanese manga style, expressive eyes, speed lines, screen tone textures."
        },
        'Korean Webtoon': {
            role: "Classic Manhwa artist.",
            styleGuide: "Traditional Korean comic style, balanced proportions, clean digital ink."
        },
        'Ghibli Style': {
            role: "Studio Ghibli inspired animator.",
            styleGuide: "Whimsical atmosphere, lush hand-painted backgrounds, soft character designs, nostalgic feel."
        },
        'Disney Style': {
            role: "Disney-style character designer.",
            styleGuide: "Large expressive eyes, fluid movement, classic 2D animation aesthetic, charming characters."
        },
        'Person of Illustration': {
            role: "Portrait illustrator.",
            styleGuide: "Focus on character personality, expressive portraiture, artistic digital painting."
        },
        'Lineless Illustration': {
            role: "Modern digital artist.",
            styleGuide: "No outlines, shapes defined by color and value, soft and clean aesthetic."
        },
        'Anaglyph 3D': {
            role: "Retro 3D artist.",
            styleGuide: "Red and cyan color separation, retro 3D glasses effect, glitchy and cool."
        },
        'Hyper Real': {
            role: "Hyper-realistic painter.",
            styleGuide: "Photorealistic details, perfect lighting, indistinguishable from a real photo."
        },
        '명랑만화': {
            role: "Cheerful and comic cartoon artist.",
            styleGuide: "Cute chibi-style characters, expressive faces, bright and simple colors."
        }
    };

    const selectedStyle = styleMap[style] || styleMap['명랑만화'];

    return {
        role: selectedStyle.role,
        styleGuide: selectedStyle.styleGuide,
        outputFormat: selectedStyle.outputFormat || commonOutputFormat
    };
}


export async function generateCharacterSheet(characterDescription: string, style: string): Promise<string> {
    const { role, styleGuide, outputFormat } = getImageStylePrompt(style);
    const ai = getAIClient();
    
    const fullPrompt = `
    # Role: ${role}
    # Task: Create a full-body character sheet for 1 person.
    # Description: ${characterDescription}
    # Style: ${styleGuide}
    ${outputFormat}
    `;

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: fullPrompt,
    config: {
      numberOfImages: 1,
      outputMimeType: "image/png",
      aspectRatio: "1:1",
    },
  });

  if (response.generatedImages && response.generatedImages.length > 0) {
    return response.generatedImages[0].image.imageBytes;
  } else {
    throw new Error("캐릭터 이미지를 생성하지 못했습니다.");
  }
}

export async function generateImage(panelDescription: string, characters: Character[], style: string): Promise<string> {
    const { role, styleGuide, outputFormat } = getImageStylePrompt(style);
    const ai = getAIClient();

    const textPrompt = `
    # Role: ${role}
    # Task: Create a single comic panel scene.
    # Scene: ${panelDescription}
    # Consistency: Ensure characters match the provided reference images.
    # Style: ${styleGuide}
    ${outputFormat}
    `;

    const imageParts = characters
        .filter(c => c.sheetImage)
        .map(c => ({
            inlineData: {
                data: c.sheetImage!,
                mimeType: 'image/png',
            },
        }));

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                ...imageParts,
                { text: textPrompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
    
    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
            return part.inlineData.data;
        }
    }

    throw new Error("만화 이미지를 생성하지 못했습니다.");
}

export async function generateContinuationScript(previousTopic: string, previousScript: FullScript, continuationTopic: string, continuationType: ContinuationType): Promise<FullScript> {
  const prompt = `
    이전 이야기: ${previousTopic}
    추가 지문: ${continuationTopic}
    위 내용을 바탕으로 이어지는 4컷 만화 대본을 JSON으로 작성하세요.
  `;
  const ai = getAIClient();
  
  const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
          responseMimeType: 'application/json',
          responseSchema: scriptSchema,
      },
  });

  const jsonText = response.text.trim();
  try {
      return JSON.parse(jsonText) as FullScript;
  } catch (e) {
      throw new Error("후속 대본 생성 오류");
  }
}
