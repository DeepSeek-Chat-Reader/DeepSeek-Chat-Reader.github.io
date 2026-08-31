// 工具函数
const utils = {
    // 翻译函数
    t: function(key, params = {}) {
        const currentLang = document.documentElement.getAttribute('lang') || 'zh-CN';
        let text = translations[currentLang]?.[key] || translations['zh-CN'][key] || key;
        
        // 替换参数
        Object.keys(params).forEach(param => {
            text = text.replace(`{${param}}`, params[param]);
        });
        
        return text;
    },
    
    // 应用翻译到页面
    applyTranslations: function() {
        const currentLang = document.documentElement.getAttribute('lang') || 'zh-CN';
        
        // 翻译所有带有data-i18n属性的元素
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = utils.t(key);
        });
        
        // 翻译所有带有data-i18n-placeholder属性的元素
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = utils.t(key);
        });
        
        // 更新主题按钮文本
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const themeIcon = themeToggle.querySelector('i');
            const themeText = themeToggle.querySelector('span');
            const currentTheme = document.documentElement.getAttribute('data-theme');
            if (currentTheme === 'dark') {
                themeText.textContent = utils.t('lightMode');
            } else {
                themeText.textContent = utils.t('darkMode');
            }
        }
        
        // 更新对话计数
        const conversationCount = document.getElementById('conversationCount');
        if (conversationCount) {
            const count = document.querySelectorAll('.conversation-item').length;
            conversationCount.textContent = utils.t('conversationCount', { count });
        }
        
        // 更新搜索统计
        const searchStats = document.getElementById('searchStats');
        if (searchStats) {
            const totalMatches = searchStats.getAttribute('data-count') || 0;
            searchStats.textContent = utils.t('searchResults', { count: totalMatches });
        }
        
        // 更新边栏按钮文本
        const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
        if (toggleSidebarBtn) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar.classList.contains('collapsed')) {
                toggleSidebarBtn.querySelector('span').textContent = utils.t('toggleSidebar');
            } else {
                toggleSidebarBtn.querySelector('span').textContent = utils.t('hideSidebar');
            }
        }
        
        // 更新内容按钮文本
        const toggleContentBtn = document.getElementById('toggleContentBtn');
        if (toggleContentBtn && toggleContentBtn.style.display !== 'none') {
            const contentArea = document.getElementById('contentArea');
            if (contentArea.classList.contains('collapsed')) {
                toggleContentBtn.querySelector('span').textContent = utils.t('toggleContent');
            } else {
                toggleContentBtn.querySelector('span').textContent = utils.t('hideContent');
            }
        }
    },
    
    // 日期格式化
    formatDateTime: function(date) {
        return date.toLocaleString([], { 
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit', 
            minute: '2-digit' 
        });
    },
    
    // 高亮文本
    highlightText: function(text, searchTerm) {
        if (!searchTerm) return text;
        
        // 转义正则特殊字符
        const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedTerm})`, 'gi');
        return text.replace(regex, '<span class="highlight">$1</span>');
    },
    
    // 防抖函数
    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // 获取语言类型
    getLanguageFromClass: function(className) {
        const match = className.match(/language-(\w+)/);
        return match ? match[1] : 'txt';
    },
    
    // 获取文件扩展名映射
    getFileExtension: function(language) {
        const extensionMap = {
            'javascript': 'js',
            'python': 'py',
            'csharp': 'cs',
            'ruby': 'rb',
            'rust': 'rs',
            'kotlin': 'kt',
            'typescript': 'ts',
            'htm': 'html',
            'bash': 'sh',
            'shell': 'sh',
            'markdown': 'md',
            'text': 'txt',
            'batch': 'bat',
            'powershell': 'ps1',
            'objective': 'm',
            'perl': 'pl',
            'haskell': 'hs',
            'erlang': 'erl',
            'elixir': 'ex',
            'yml': 'yaml',
            'makefile': 'mk'
        };
        
        return extensionMap[language] || language;
    },
    
    // 检测代码语言
    detectCodeLanguage: function(code) {
        // 常见代码语言检测
        if (code.includes('function') && (code.includes('{') && code.includes('}'))) {
            return 'javascript';
        }
        if (code.includes('def ') && code.includes(':')) {
            return 'python';
        }
        if (code.includes('<?php') || code.includes('$')) {
            return 'php';
        }
        if (code.includes('import ') && (code.includes('java.') || code.includes('class '))) {
            return 'java';
        }
        if (code.includes('#include') || code.includes('using namespace')) {
            return 'cpp';
        }
        if (code.includes('<html') || code.includes('<div') || code.includes('<span')) {
            return 'html';
        }
        if (code.includes('SELECT') || code.includes('FROM') || code.includes('WHERE')) {
            return 'sql';
        }
        if (code.includes('package ') || code.includes('import ') || code.includes('func ')) {
            return 'go';
        }
        if (code.includes('fn ') || code.includes('let ') || code.includes('mut ')) {
            return 'rust';
        }
        
        return 'txt';
    },
    
    // HTML转义函数
    escapeHtml: function(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};