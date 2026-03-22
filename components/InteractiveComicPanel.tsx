import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { PanelScript, TailDirection } from '../types';

// --- TYPE DEFINITIONS ---
export interface BubbleConfig {
    x: number;
    y: number;
    width: number;
    height: number;
    tailTipX: number;
    tailTipY: number;
    tailDirection: TailDirection;
    rotation: number; // Rotation in radians
    style: 'speech' | 'thought' | 'shout';
    outlineColor: string;
}

interface InteractiveComicPanelProps {
    rawImage: string;
    panel: PanelScript;
    bubbleConfig: BubbleConfig;
    onBubbleConfigChange: (newConfig: BubbleConfig) => void;
}

type Handle = 'tl' | 't' | 'tr' | 'l' | 'r' | 'bl' | 'b' | 'br' | 'rotate' | 'tail' | 'body';

type ActiveDrag = {
    type: Handle;
    initialConfig: BubbleConfig;
    startMouse: { x: number, y: number };
    center: { x: number, y: number };
} | null;


// --- DRAWING HELPERS (Exported for use in downloads) ---
const bubbleOutlineColors = ['#000000', '#FF0000', '#0000FF', '#008000', '#FFFF00', '#FFA500', '#800080', '#A52A2A'];

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
    return ctx;
}

const drawCloudBubble = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
    ctx.beginPath();
    const p = 15; // puffiness factor
    ctx.moveTo(x, y + p);
    ctx.quadraticCurveTo(x, y, x + p, y);
    ctx.quadraticCurveTo(x + width / 2, y - p, x + width - p, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + p);
    ctx.quadraticCurveTo(x + width + p, y + height / 2, x + width, y + height - p);
    ctx.quadraticCurveTo(x + width, y + height, x + width - p, y + height);
    ctx.quadraticCurveTo(x + width / 2, y + height + p, x + p, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - p);
    ctx.quadraticCurveTo(x - p, y + height / 2, x, y + p);
    ctx.closePath();
}

const drawShoutBubble = (ctx: CanvasRenderingContext2D, config: BubbleConfig) => {
    const { x, y, width, height } = config;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    const radiusX = width / 2;
    const radiusY = height / 2;
    const numSpikes = Math.max(8, Math.floor((width + height) / 25));
    const angleStep = (Math.PI * 2) / numSpikes;
    const spikePoints = [];
    
    // Generate the tips of the spikes on an ellipse with some randomness
    for (let i = 0; i < numSpikes; i++) {
        const angle = i * angleStep;
        const randomFactor = 1.0 + (Math.random() - 0.5) * 0.15;
        spikePoints.push({
            x: centerX + Math.cos(angle) * radiusX * randomFactor,
            y: centerY + Math.sin(angle) * radiusY * randomFactor,
        });
    }
    
    // Draw the path by creating valleys between the spikes
    ctx.beginPath();
    ctx.moveTo(spikePoints[0].x, spikePoints[0].y);

    for (let i = 0; i < numSpikes; i++) {
        const p1 = spikePoints[i];
        const p2 = spikePoints[(i + 1) % numSpikes];

        const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const insetFactor = 0.4 + (Math.random() * 0.1);
        const controlPoint = {
            x: midPoint.x * (1 - insetFactor) + centerX * insetFactor,
            y: midPoint.y * (1 - insetFactor) + centerY * insetFactor
        };
        ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, p2.x, p2.y);
    }
    ctx.closePath();
};


const drawSpeechBubble = (ctx: CanvasRenderingContext2D, config: BubbleConfig) => {
    const { x, y, width, height, tailTipX, tailTipY, tailDirection, rotation } = config;
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    const tailTipRotated = rotatePoint(tailTipX, tailTipY, centerX, centerY, -rotation);
    
    const cornerRadius = Math.min(25, width / 4, height / 4);
    const tailWidth = Math.min(30, width / 4, height / 4);
    
    ctx.beginPath();
    
    // Top-left corner
    ctx.moveTo(x + cornerRadius, y);
    
    // Top edge
    if (tailDirection.startsWith('top')) {
        let baseStart, baseEnd;
        if (tailDirection === 'top-left') { baseStart = x + width * 0.25; }
        else if (tailDirection === 'top-right') { baseStart = x + width * 0.75 - tailWidth; }
        else { baseStart = x + (width - tailWidth) / 2; }
        baseEnd = baseStart + tailWidth;
        
        ctx.lineTo(baseStart, y);
        const c1x = (baseStart + tailTipRotated.x)/2, c2x = (baseEnd + tailTipRotated.x)/2;
        const cy = y + (tailTipRotated.y - y) * 0.5;
        ctx.quadraticCurveTo(c1x, cy, tailTipRotated.x, tailTipRotated.y);
        ctx.quadraticCurveTo(c2x, cy, baseEnd, y);
    }
    ctx.lineTo(x + width - cornerRadius, y);
    
    // Top-right corner
    ctx.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
    
    // Right edge
    if (tailDirection.startsWith('right')) {
        let baseStart, baseEnd;
        if (tailDirection === 'right-top') { baseStart = y + height * 0.25; }
        else if (tailDirection === 'right-bottom') { baseStart = y + height * 0.75 - tailWidth; }
        else { baseStart = y + (height - tailWidth) / 2; }
        baseEnd = baseStart + tailWidth;
        
        ctx.lineTo(x + width, baseStart);
        const cx = x + width + (tailTipRotated.x - (x + width)) * 0.5;
        const c1y = (baseStart + tailTipRotated.y)/2, c2y = (baseEnd + tailTipRotated.y)/2;
        ctx.quadraticCurveTo(cx, c1y, tailTipRotated.x, tailTipRotated.y);
        ctx.quadraticCurveTo(cx, c2y, x + width, baseEnd);
    }
    ctx.lineTo(x + width, y + height - cornerRadius);
    
    // Bottom-right corner
    ctx.quadraticCurveTo(x + width, y + height, x + width - cornerRadius, y + height);
    
    // Bottom edge
    if (tailDirection.startsWith('bottom')) {
        let baseStart, baseEnd;
        if (tailDirection === 'bottom-left') { baseStart = x + width * 0.25; }
        else if (tailDirection === 'bottom-right') { baseStart = x + width * 0.75 - tailWidth; }
        else { baseStart = x + (width - tailWidth) / 2; }
        baseEnd = baseStart + tailWidth;
        
        ctx.lineTo(baseEnd, y + height);
        const c1x = (baseEnd + tailTipRotated.x)/2, c2x = (baseStart + tailTipRotated.x)/2;
        const cy = y + height + (tailTipRotated.y - (y + height)) * 0.5;
        ctx.quadraticCurveTo(c1x, cy, tailTipRotated.x, tailTipRotated.y);
        ctx.quadraticCurveTo(c2x, cy, baseStart, y + height);
    }
    ctx.lineTo(x + cornerRadius, y + height);

    // Bottom-left corner
    ctx.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
    
    // Left edge
    if (tailDirection.startsWith('left')) {
        let baseStart, baseEnd;
        if (tailDirection === 'left-top') { baseStart = y + height * 0.25; }
        else if (tailDirection === 'left-bottom') { baseStart = y + height * 0.75 - tailWidth; }
        else { baseStart = y + (height - tailWidth) / 2; }
        baseEnd = baseStart + tailWidth;
        
        ctx.lineTo(x, baseEnd);
        const cx = x + (tailTipRotated.x - x) * 0.5;
        const c1y = (baseEnd + tailTipRotated.y)/2, c2y = (baseStart + tailTipRotated.y)/2;
        ctx.quadraticCurveTo(cx, c1y, tailTipRotated.x, tailTipRotated.y);
        ctx.quadraticCurveTo(cx, c2y, x, baseStart);
    }
    ctx.lineTo(x, y + cornerRadius);

    // Top-left corner to finish
    ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
    ctx.closePath();
};

const drawThoughtBubbleTail = (ctx: CanvasRenderingContext2D, config: BubbleConfig) => {
    const { x, y, width, height, tailTipX, tailTipY, rotation } = config;
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    // Transform the global tail tip position into the bubble's local (rotated) coordinate space
    const localTailTip = rotatePoint(tailTipX, tailTipY, centerX, centerY, -rotation);
    
    const dx = localTailTip.x - centerX;
    const dy = localTailTip.y - centerY;
    const angle = Math.atan2(dy, dx);
    
    const radiusX = width / 2;
    const radiusY = height / 2;
    
    // Estimate a point on the cloud's edge using an ellipse as a good approximation
    const effectiveRadius = (radiusX * radiusY) / Math.sqrt(
        (radiusY * Math.cos(angle))**2 + (radiusX * Math.sin(angle))**2
    );
    
    // The start point is on the edge of the bubble, in local coordinates
    const startPoint = {
        x: centerX + Math.cos(angle) * (effectiveRadius + 10), // start slightly outside
        y: centerY + Math.sin(angle) * (effectiveRadius + 10),
    };

    // Prevent drawing if the tail handle is inside the bubble's effective radius
    const startDist = Math.hypot(startPoint.x - centerX, startPoint.y - centerY);
    const tipDist = Math.hypot(localTailTip.x - centerX, localTailTip.y - centerY);
    if (tipDist <= startDist) return;

    // Vector from bubble edge to the tail tip
    const totalVector = { x: localTailTip.x - startPoint.x, y: localTailTip.y - startPoint.y };
    
    // Radii of the circles, smallest to largest
    const radii = [6, 10, 16];
    const numCircles = radii.length;

    // Position circles along the vector. Smallest circle is at the tail tip.
    for (let i = 0; i < numCircles; i++) {
        // t=1 is at tail tip, t=0 is at bubble edge.
        // Position them from smallest (i=0, at the tip) to largest (i=2, near the bubble).
        const t = 1 - (i * 0.35); // e.g., for i=0, t=1; i=1, t=0.65; i=2, t=0.3
        const circleCenter = {
            x: startPoint.x + totalVector.x * t,
            y: startPoint.y + totalVector.y * t,
        };
        
        ctx.beginPath();
        ctx.arc(circleCenter.x, circleCenter.y, radii[i], 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }
};

const createLines = (ctx: CanvasRenderingContext2D, text: string, font: string, maxTextWidth: number): string[] => {
    ctx.font = font;
    const words = text.split(' ');
    let line = '';
    const lines = [];
    for(let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxTextWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    return lines;
}

const drawTextInBubble = (ctx: CanvasRenderingContext2D, dialogue: string, config: BubbleConfig, fontSize: number, lineHeight: number, lines: string[], bubblePadding: number) => {
    const { x, y } = config;
    
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000000';
    const textStartX = x + bubblePadding / 2;
    const textStartY = y + bubblePadding / 2;

    for(let i = 0; i < lines.length; i++) {
        const currentLine = lines[i].trim();
        const yPos = textStartY + (i * lineHeight);
        ctx.fillText(currentLine, textStartX, yPos);
    }
}

// --- MAIN EXPORTED DRAW FUNCTION (For static generation and downloads) ---

export const drawTextOnImage = (
    base64Image: string, 
    panel: PanelScript, 
    style: string, 
    overrideConfig?: BubbleConfig
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = `data:image/png;base64,${base64Image}`;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Could not get canvas context'));
    
            ctx.drawImage(img, 0, 0);
    
            if (!panel.dialogue || panel.dialogue.trim() === '' || panel.dialogue === '없음') {
                resolve(canvas.toDataURL('image/png').split(',')[1]);
                return;
            }

            const fontSize = Math.max(16, canvas.width / 28);
            const padding = canvas.width * 0.04;
            const lineHeight = fontSize * 1.3;

            switch(style) {
                case 'speech-bubble': {
                    if (!overrideConfig) {
                        return reject(new Error('Bubble config is required for speech-bubble style'));
                    }
                    const config = overrideConfig;
                    const font = `bold ${fontSize}px 'Noto Sans KR', sans-serif`;
                    const textToDraw = panel.dialogue;
                    const textPadding = config.style === 'shout' ? fontSize * 6.0 : fontSize * 1.5;
                    const lines = createLines(ctx, textToDraw, font, config.width - textPadding);
                    
                    const centerX = config.x + config.width / 2;
                    const centerY = config.y + config.height / 2;
                    
                    ctx.save();
                    ctx.translate(centerX, centerY);
                    ctx.rotate(config.rotation || 0);
                    ctx.translate(-centerX, -centerY);

                    ctx.fillStyle = 'white';
                    ctx.strokeStyle = config.outlineColor || '#000000';
                    ctx.lineWidth = Math.max(2, fontSize / 10);
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                    ctx.shadowBlur = 5;
                    ctx.shadowOffsetY = 2;

                    switch(config.style) {
                        case 'thought':
                            drawCloudBubble(ctx, config.x, config.y, config.width, config.height);
                            ctx.fill();
                            ctx.stroke();
                            
                            ctx.shadowColor = 'transparent';
                            drawThoughtBubbleTail(ctx, config);
                            break;
                        case 'shout':
                            drawShoutBubble(ctx, config);
                            ctx.fill();
                            ctx.stroke();
                            break;
                        case 'speech':
                        default:
                            drawSpeechBubble(ctx, config);
                            ctx.fill();
                            ctx.stroke();
                            break;
                    }

                    ctx.shadowColor = 'transparent';
                    drawTextInBubble(ctx, textToDraw, config, fontSize, lineHeight, lines, textPadding);

                    ctx.restore();
                    break;
                }
                case 'webtoon': {
                    const hasSpeaker = panel.character && panel.character !== '없음' && panel.character !== '생각';
                    const textToDraw = hasSpeaker ? `${panel.character}: ${panel.dialogue}` : panel.dialogue;
                    const lines = createLines(ctx, textToDraw, `bold ${fontSize}px 'Noto Sans KR', sans-serif`, canvas.width - (padding * 3));
                    const boxWidth = canvas.width - (padding * 2);
                    const boxHeight = (lines.length * lineHeight) + padding;
                    const boxY = canvas.height - boxHeight - padding;

                    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                    ctx.shadowBlur = 8;
                    ctx.shadowOffsetY = 3;

                    ctx.fillStyle = 'white';
                    roundRect(ctx, padding, boxY, boxWidth, boxHeight, 15).fill();
                    
                    ctx.shadowColor = 'transparent';

                    ctx.strokeStyle = '#333';
                    ctx.lineWidth = Math.max(2, fontSize/10);
                    roundRect(ctx, padding, boxY, boxWidth, boxHeight, 15).stroke();

                    // For Webtoon, we re-implement the text drawing logic to handle speaker name color
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    const textStartX = padding + padding / 2;
                    const textStartY = boxY + padding / 2;
                    
                    for (let i = 0; i < lines.length; i++) {
                        const currentLine = lines[i].trim();
                        const yPos = textStartY + (i * lineHeight);
                        let xPos = textStartX;
                        if (hasSpeaker && i === 0 && currentLine.startsWith(panel.character + ':')) {
                            const characterPart = `${panel.character}: `;
                            const dialoguePart = currentLine.substring(characterPart.length);
                    
                            ctx.fillStyle = '#F97316';
                            ctx.fillText(characterPart, xPos, yPos);
                    
                            const characterMetrics = ctx.measureText(characterPart);
                            xPos += characterMetrics.width;
                    
                            ctx.fillStyle = '#000000';
                            ctx.fillText(dialoguePart, xPos, yPos);
                        } else {
                            ctx.fillStyle = '#000000';
                            ctx.fillText(currentLine, xPos, yPos);
                        }
                    }
                    break;
                }
                case 'narration': {
                    const lines = createLines(ctx, panel.dialogue, `italic bold ${fontSize}px 'Noto Sans KR', sans-serif`, canvas.width - (padding * 3));
                    const boxWidth = canvas.width - (padding * 2);
                    const boxHeight = (lines.length * lineHeight) + padding;
                    const boxY = padding;
    
                    ctx.fillStyle = 'rgba(255, 250, 205, 0.9)'; // LemonChiffon with alpha
                    ctx.fillRect(padding, boxY, boxWidth, boxHeight);
                    ctx.strokeStyle = '#8B4513';
                    ctx.lineWidth = Math.max(2, fontSize/10);
                    ctx.strokeRect(padding, boxY, boxWidth, boxHeight);
                    
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillStyle = '#000000';
                    for(let i = 0; i < lines.length; i++) {
                        ctx.fillText(lines[i].trim(), canvas.width / 2, boxY + (padding / 2) + (i * lineHeight));
                    }
                    break;
                }
                case 'cinematic': {
                    const hasSpeaker = panel.character && panel.character !== '없음' && panel.character !== '생각';
                    const textToDraw = hasSpeaker ? `${panel.character}: ${panel.dialogue}` : panel.dialogue;
                    const lines = createLines(ctx, textToDraw, `bold ${fontSize}px 'Noto Sans KR', sans-serif`, canvas.width - (padding * 2));
                    const totalTextHeight = (lines.length * lineHeight);
                    const startY = canvas.height - padding - totalTextHeight;
                    
                    ctx.lineWidth = fontSize / 5;
                    ctx.strokeStyle = 'black';
                    ctx.lineJoin = 'round';
                    ctx.fillStyle = 'white';
                    
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        const yPos = startY + (i * lineHeight);
                        const xPos = padding;
                        ctx.strokeText(line, xPos, yPos);
                        ctx.fillText(line, xPos, yPos);
                    }
                    break;
                }
                case 'simple':
                default: {
                    const hasSpeaker = panel.character && panel.character !== '없음' && panel.character !== '생각';
                    const textToDraw = hasSpeaker ? `${panel.character}: ${panel.dialogue}` : panel.dialogue;
                    const lines = createLines(ctx, textToDraw, `bold ${fontSize}px 'Noto Sans KR', sans-serif`, canvas.width - (padding * 3));
                    const boxWidth = canvas.width - (padding * 2);
                    const boxHeight = (lines.length * lineHeight) + padding;
                    const boxY = canvas.height - boxHeight - padding;
            
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                    ctx.fillRect(padding, boxY, boxWidth, boxHeight);
                    
                    // Same text drawing as webtoon
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    const textStartX = padding + padding / 2;
                    const textStartY = boxY + padding / 2;
                    for (let i = 0; i < lines.length; i++) {
                        const currentLine = lines[i].trim();
                        const yPos = textStartY + (i * lineHeight);
                        let xPos = textStartX;
                        if (hasSpeaker && i === 0 && currentLine.startsWith(panel.character + ':')) {
                            const characterPart = `${panel.character}: `;
                            const dialoguePart = currentLine.substring(characterPart.length);
                            ctx.fillStyle = '#F97316';
                            ctx.fillText(characterPart, xPos, yPos);
                            const characterMetrics = ctx.measureText(characterPart);
                            xPos += characterMetrics.width;
                            ctx.fillStyle = '#000000';
                            ctx.fillText(dialoguePart, xPos, yPos);
                        } else {
                            ctx.fillStyle = '#000000';
                            ctx.fillText(currentLine, xPos, yPos);
                        }
                    }
                    break;
                }
            }
            resolve(canvas.toDataURL('image/png').split(',')[1]);
        };
        img.onerror = (err) => reject(err);
    });
}

export const getDefaultBubbleConfig = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, panel: PanelScript, defaultOutlineColor: string = '#000000'): BubbleConfig => {
    const fontSize = Math.max(16, canvasWidth / 28);
    const lineHeight = fontSize * 1.3;
    const padding = canvasWidth * 0.04;

    const textToDraw = panel.dialogue;
    
    const font = `bold ${fontSize}px 'Noto Sans KR', sans-serif`;
    const lines = createLines(ctx, textToDraw, font, canvasWidth * 0.8);

    const bubblePadding = fontSize * 1.5;
    const textBlockWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    const textBlockHeight = lines.length * lineHeight;

    const width = textBlockWidth + bubblePadding;
    const height = textBlockHeight - (lineHeight - fontSize) + bubblePadding;
    const x = (canvasWidth - width) / 2;
    const y = padding * 2;
    
    const tailDirection = 'bottom-center';
    const tailTipY = y + height + padding * 1.8;
    const tailTipX = x + width / 2;
    
    return { x, y, width, height, tailTipX, tailTipY, tailDirection, rotation: 0, style: 'speech', outlineColor: defaultOutlineColor };
};


// --- UTILITY FUNCTIONS ---
const rotatePoint = (x: number, y: number, cx: number, cy: number, angle: number) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: (cos * (x - cx)) + (sin * (y - cy)) + cx,
        y: (cos * (y - cy)) - (sin * (x - cx)) + cy
    };
};

const getHandles = (config: BubbleConfig) => {
    const { x, y, width, height, tailTipX, tailTipY, rotation } = config;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const hx = width / 2;
    const hy = height / 2;
    const rotate = (px: number, py: number) => rotatePoint(px, py, cx, cy, rotation);

    const ROTATE_HANDLE_OFFSET = 30;

    return {
        tl: rotate(x, y),
        t: rotate(cx, y),
        tr: rotate(x + width, y),
        l: rotate(x, cy),
        r: rotate(x + width, cy),
        bl: rotate(x, y + height),
        b: rotate(cx, y + height),
        br: rotate(x + width, y + height),
        tail: { x: tailTipX, y: tailTipY },
        rotate: rotate(cx, y - ROTATE_HANDLE_OFFSET),
    };
};


// --- REACT COMPONENT ---
export const InteractiveComicPanel: React.FC<InteractiveComicPanelProps> = ({
    rawImage,
    panel,
    bubbleConfig,
    onBubbleConfigChange,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);
    const [hoveredHandle, setHoveredHandle] = useState<Handle | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);

    const HANDLE_SIZE = 12;

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageRef.current) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear and draw base image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);

        // Draw bubble and text
        if (panel.dialogue && panel.dialogue.trim() !== '' && panel.dialogue !== '없음') {
            const { x, y, width, height, rotation } = bubbleConfig;
            const centerX = x + width / 2;
            const centerY = y + height / 2;
            
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(rotation);
            ctx.translate(-centerX, -centerY);

            const fontSize = Math.max(16, canvas.width / 28);
            const lineHeight = fontSize * 1.3;
            const font = `bold ${fontSize}px 'Noto Sans KR', sans-serif`;
            const textToDraw = panel.dialogue;

            const textPadding = bubbleConfig.style === 'shout' ? fontSize * 6.0 : fontSize * 1.5;
            const lines = createLines(ctx, textToDraw, font, bubbleConfig.width - textPadding);

            ctx.fillStyle = 'white';
            ctx.strokeStyle = bubbleConfig.outlineColor || '#000000';
            ctx.lineWidth = Math.max(2, fontSize / 10);
            
            switch (bubbleConfig.style) {
                case 'thought':
                    drawCloudBubble(ctx, bubbleConfig.x, bubbleConfig.y, bubbleConfig.width, bubbleConfig.height);
                    ctx.fill();
                    ctx.stroke();
                    drawThoughtBubbleTail(ctx, bubbleConfig);
                    break;
                case 'shout':
                    drawShoutBubble(ctx, bubbleConfig);
                    ctx.fill();
                    ctx.stroke();
                    break;
                case 'speech':
                default:
                    drawSpeechBubble(ctx, bubbleConfig);
                    ctx.fill();
                    ctx.stroke();
                    break;
            }

            drawTextInBubble(ctx, panel.dialogue, bubbleConfig, fontSize, lineHeight, lines, textPadding);
            
            ctx.restore();

            // Draw handles for interaction
            ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            
            const handles = getHandles(bubbleConfig);
            Object.entries(handles).forEach(([key, pos]) => {
                if (key === 'tail') return;
                 // Draw line for rotation handle
                if (key === 'rotate') {
                    const boxTopCenter = rotatePoint(centerX, y, centerX, centerY, rotation);
                    ctx.beginPath();
                    ctx.moveTo(boxTopCenter.x, boxTopCenter.y);
                    ctx.lineTo(pos.x, pos.y);
                    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                    ctx.stroke();
                }

                ctx.beginPath();
                ctx.arc(pos.x, pos.y, HANDLE_SIZE / 2, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            });

            // Draw tail handle separately, unless it's a shout bubble
            if (bubbleConfig.style !== 'shout') {
                const tailHandlePos = handles.tail;
                ctx.beginPath();
                ctx.arc(tailHandlePos.x, tailHandlePos.y, HANDLE_SIZE / 1.5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            }
        }
    }, [bubbleConfig, panel]);

    useEffect(() => {
        const img = new Image();
        img.src = `data:image/png;base64,${rawImage}`;
        img.onload = () => {
            imageRef.current = img;
            const canvas = canvasRef.current;
            if (canvas) {
                const displayWidth = canvas.parentElement?.clientWidth || 512;
                canvas.style.width = `${displayWidth}px`;
                canvas.style.height = `${displayWidth / (img.width / img.height)}px`;
                canvas.width = img.width;
                canvas.height = img.height;
            }
            draw();
        };
    }, [rawImage, draw]);

    useEffect(() => {
        draw();
    }, [bubbleConfig, draw]);

    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    };

    const getHandleAtPos = (pos: { x: number, y: number }): Handle | null => {
        const handles = getHandles(bubbleConfig);
        for (const [key, handlePos] of Object.entries(handles)) {
            if (key === 'tail' && bubbleConfig.style === 'shout') continue;
            const dist = Math.hypot(pos.x - handlePos.x, pos.y - handlePos.y);
            if (dist < HANDLE_SIZE) {
                return key as Handle;
            }
        }

        // Check body - requires point-in-rotated-rectangle check
        const { x, y, width, height, rotation } = bubbleConfig;
        const cx = x + width / 2;
        const cy = y + height / 2;
        const rotatedPos = rotatePoint(pos.x, pos.y, cx, cy, -rotation);
        if (rotatedPos.x > x && rotatedPos.x < x + width && rotatedPos.y > y && rotatedPos.y < y + height) {
            return 'body';
        }

        return null;
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button === 2) return; // Ignore right-clicks for dragging
        const pos = getMousePos(e);
        const handle = getHandleAtPos(pos);
        if (handle) {
            const center = {
                x: bubbleConfig.x + bubbleConfig.width / 2,
                y: bubbleConfig.y + bubbleConfig.height / 2
            };
            setActiveDrag({ type: handle, initialConfig: bubbleConfig, startMouse: pos, center });
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getMousePos(e);
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (activeDrag) {
            let newConfig = { ...activeDrag.initialConfig };
            const mouseDx = pos.x - activeDrag.startMouse.x;
            const mouseDy = pos.y - activeDrag.startMouse.y;
            const initial = activeDrag.initialConfig;

            switch (activeDrag.type) {
                case 'body':
                    newConfig.x += mouseDx;
                    newConfig.y += mouseDy;
                    newConfig.tailTipX += mouseDx;
                    newConfig.tailTipY += mouseDy;
                    break;
                case 'tail':
                    newConfig.tailTipX = pos.x;
                    newConfig.tailTipY = pos.y;
                    
                    // Auto-update tail direction based on relative position to the un-rotated box
                    const centerX = initial.x + initial.width / 2;
                    const centerY = initial.y + initial.height / 2;
                    const rotatedTip = rotatePoint(pos.x, pos.y, centerX, centerY, -initial.rotation);

                    const halfW = initial.width / 2;
                    const halfH = initial.height / 2;

                    const topDist = (initial.y - rotatedTip.y) / halfH;
                    const bottomDist = (rotatedTip.y - (initial.y + initial.height)) / halfH;
                    const leftDist = (initial.x - rotatedTip.x) / halfW;
                    const rightDist = (rotatedTip.x - (initial.x + initial.width)) / halfW;
                    
                    const maxDist = Math.max(topDist, bottomDist, leftDist, rightDist);
                    
                    let primaryDir: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

                    if (maxDist > 0) {
                        if (maxDist === topDist) primaryDir = 'top';
                        else if (maxDist === bottomDist) primaryDir = 'bottom';
                        else if (maxDist === leftDist) primaryDir = 'left';
                        else if (maxDist === rightDist) primaryDir = 'right';
                    } else {
                        const distances = {
                            top: Math.abs(rotatedTip.y - initial.y),
                            bottom: Math.abs(rotatedTip.y - (initial.y + initial.height)),
                            left: Math.abs(rotatedTip.x - initial.x),
                            right: Math.abs(rotatedTip.x - (initial.x + initial.width)),
                        };
                        const minEdgeDist = Math.min(...Object.values(distances));
                        if (minEdgeDist === distances.top) primaryDir = 'top';
                        else if (minEdgeDist === distances.bottom) primaryDir = 'bottom';
                        else if (minEdgeDist === distances.left) primaryDir = 'left';
                        else primaryDir = 'right';
                    }

                    let secondaryDir: string;
                    if (primaryDir === 'top' || primaryDir === 'bottom') {
                        const relativeX = (rotatedTip.x - initial.x) / initial.width;
                        if (relativeX < 0.33) secondaryDir = 'left';
                        else if (relativeX > 0.66) secondaryDir = 'right';
                        else secondaryDir = 'center';
                    } else { // left or right
                        const relativeY = (rotatedTip.y - initial.y) / initial.height;
                        if (relativeY < 0.33) secondaryDir = 'top';
                        else if (relativeY > 0.66) secondaryDir = 'bottom';
                        else secondaryDir = 'center';
                    }

                    newConfig.tailDirection = `${primaryDir}-${secondaryDir}` as TailDirection;
                    break;
                case 'rotate':
                    const startAngle = Math.atan2(activeDrag.startMouse.y - activeDrag.center.y, activeDrag.startMouse.x - activeDrag.center.x);
                    const currentAngle = Math.atan2(pos.y - activeDrag.center.y, pos.x - activeDrag.center.x);
                    newConfig.rotation = initial.rotation + (currentAngle - startAngle);
                    break;
                default: { // Resize handles
                    const theta = initial.rotation;
                    const cos = Math.cos(theta);
                    const sin = Math.sin(theta);

                    // Decompose mouse delta into components along the bubble's rotated axes
                    const proj_x = mouseDx * cos + mouseDy * sin;
                    const proj_y = -mouseDx * sin + mouseDy * cos;

                    let widthChange = 0;
                    let heightChange = 0;

                    if (activeDrag.type.includes('l')) {
                        widthChange = -proj_x;
                    } else if (activeDrag.type.includes('r')) {
                        widthChange = proj_x;
                    }

                    if (activeDrag.type.includes('t')) {
                        heightChange = -proj_y;
                    } else if (activeDrag.type.includes('b')) {
                        heightChange = proj_y;
                    }
                    
                    const newWidth = initial.width + widthChange;
                    const newHeight = initial.height + heightChange;

                    if (newWidth > 20 && newHeight > 20) {
                        const centerShift_local_x = widthChange / 2;
                        const centerShift_local_y = heightChange / 2;

                        const centerShift_global_x = centerShift_local_x * cos - centerShift_local_y * sin;
                        const centerShift_global_y = centerShift_local_x * sin + centerShift_local_y * cos;

                        const newCenter = {
                            x: activeDrag.center.x + centerShift_global_x,
                            y: activeDrag.center.y + centerShift_global_y,
                        };
                        
                        newConfig.width = newWidth;
                        newConfig.height = newHeight;
                        newConfig.x = newCenter.x - newWidth / 2;
                        newConfig.y = newCenter.y - newHeight / 2;
                    }
                    
                    break;
                }
            }
            onBubbleConfigChange(newConfig);

        } else {
            const handle = getHandleAtPos(pos);
            setHoveredHandle(handle);
            switch (handle) {
                case 'body': canvas.style.cursor = 'move'; break;
                case 'tail': canvas.style.cursor = 'grab'; break;
                case 'rotate': canvas.style.cursor = 'crosshair'; break;
                case 'tl': case 'br': canvas.style.cursor = 'nwse-resize'; break;
                case 'tr': case 'bl': canvas.style.cursor = 'nesw-resize'; break;
                case 't': case 'b': canvas.style.cursor = 'ns-resize'; break;
                case 'l': case 'r': canvas.style.cursor = 'ew-resize'; break;
                default: canvas.style.cursor = 'default'; break;
            }
        }
    };
    
    const handleMouseUp = () => {
        setActiveDrag(null);
    };

    const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const rect = canvasRef.current!.getBoundingClientRect();
        setContextMenu({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            visible: true,
        });
    };

    const handleStyleChange = (newStyle: BubbleConfig['style']) => {
        onBubbleConfigChange({ ...bubbleConfig, style: newStyle });
        setContextMenu(null);
    };

    const handleColorChange = (newColor: string) => {
        onBubbleConfigChange({ ...bubbleConfig, outlineColor: newColor });
        setContextMenu(null);
    };

    return (
        <div className="aspect-square relative w-full h-full flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden border-4 border-orange-200">
             <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={handleContextMenu}
                className="max-w-full max-h-full object-contain"
            />
            {contextMenu?.visible && (
                <div 
                    style={{ top: contextMenu.y, left: contextMenu.x, position: 'absolute' }}
                    className="bg-white rounded-md shadow-lg py-1 z-10 border border-gray-200"
                >
                    <button onClick={() => handleStyleChange('speech')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      말풍선
                    </button>
                    <button onClick={() => handleStyleChange('thought')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      생각
                    </button>
                    <button onClick={() => handleStyleChange('shout')} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      외침
                    </button>
                    <div className="border-t border-gray-200 my-1"></div>
                    <div className="px-4 pt-2 pb-1 text-xs text-gray-500">외곽선 색상</div>
                    <div className="px-3 pb-2 grid grid-cols-4 gap-1.5">
                        {bubbleOutlineColors.map(color => (
                            <button
                                key={color}
                                onClick={() => handleColorChange(color)}
                                className={`w-6 h-6 rounded-full border-2 transition-transform transform hover:scale-110 ${bubbleConfig.outlineColor === color ? 'border-orange-400 ring-2 ring-orange-200' : 'border-gray-300'}`}
                                style={{ backgroundColor: color }}
                                aria-label={`Select color ${color}`}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
