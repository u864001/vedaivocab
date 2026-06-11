// 提取 React Hooks 到全域，讓後續所有組件都能直接使用
const { useState, useEffect, useRef, useMemo } = React;

const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRHP_-ulCqptjhzeRMyfZ79zmCn6AtNZjBwphgXy--JOdEmkvTiV0_OX2kbq42w-HzGN7wDu35SDZ5h/pub?output=csv"; 

const DEFAULT_WORD_DATABASE = [
    { id: 1, book: 1, lesson: 1, en: 'apple', zh: '蘋果' },
    { id: 2, book: 1, lesson: 1, en: 'banana', zh: '香蕉' },
    { id: 3, book: 2, lesson: 2, en: 'school', zh: '學校' },
];

const BAD_WORDS = ['幹', '靠', '死', '媽的', '智障', '白痴', '賤', 'fuck', 'shit', 'bitch'];

const isValidName = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (/^[\u4e00-\u9fa5]+$/.test(trimmed) && trimmed.length <= 3) return true;
    if (/^[a-zA-Z\s]+$/.test(trimmed) && trimmed.length <= 6) return true;
    return false;
};

const containsProfanity = (name) => BAD_WORDS.some(bw => name.toLowerCase().includes(bw));

const getWeekNumber = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const getLessonWeight = (lesson) => {
    if (typeof lesson === 'number') return lesson * 10; 
    const lStr = String(lesson).toLowerCase();
    if (lStr.includes('starter')) return 0;      
    if (lStr.includes('review')) return 1000;    
    if (lStr.includes('festival')) return 2000;  
    return 500; 
};

const parseCSV = (text) => {
    const result = [];
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return result;
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    for (let i = 1; i < lines.length; i++) {
        const currentline = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            let val = currentline[j] ? currentline[j].trim().replace(/^"|"$/g, '').replace(/""/g, '"') : "";
            if (headers[j] === 'id' || headers[j] === 'book') obj[headers[j]] = parseInt(val, 10) || 1;
            else if (headers[j] === 'lesson') obj[headers[j]] = isNaN(parseInt(val, 10)) ? val : parseInt(val, 10);
            else obj[headers[j]] = val;
        }
        if (obj.en && obj.zh) result.push(obj);
    }
    return result;
};
