// 配置marked和highlight.js
marked.setOptions({
    highlight: function(code, lang) {
        if (!lang) {
            // 自动检测语言
            lang = utils.detectCodeLanguage(code);
        }
        
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    }
});

// 应用程序状态
let conversationsData = [];
let conversationFilters = {
    search: '',
    dateRange: {
        start: null,
        end: null
    },
    sortBy: 'newest'
};

let currentConversation = null;
let eventListeners = [];
let branchNavigationIndex = {}; // 存储当前分支状态
let isProcessing = false; // 标记是否正在处理数据

// 显示加载指示器
function showLoading() {
    isProcessing = true;
    loading.style.display = 'block';
}

// 隐藏加载指示器
function hideLoading() {
    isProcessing = false;
    loading.style.display = 'none';
}

// 初始化语言设置
function initLanguage() {
    const savedLang = localStorage.getItem('preferredLanguage') || 'zh-CN';
    languageSelect.value = savedLang;
    document.documentElement.setAttribute('lang', savedLang);
    utils.applyTranslations();
}

// 初始化主题（根据系统设置）
function initTheme() {
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const themeIcon = themeToggle.querySelector('i');
    const themeText = themeToggle.querySelector('span');
    if (systemPrefersDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeIcon.className = 'fas fa-sun';
        themeText.textContent = utils.t('lightMode');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        themeIcon.className = 'fas fa-moon';
        themeText.textContent = utils.t('darkMode');
    }
}

// 打开上传模态窗口
function openUploadModal() {
    uploadModal.classList.add('active');
    modalOverlay.classList.add('active');
}

// 关闭上传模态窗口
function closeUploadModal() {
    uploadModal.classList.remove('active');
    modalOverlay.classList.remove('active');
}

// 切换边栏显示/隐藏
function toggleSidebar() {
    // 在纵向布局下，边栏切换逻辑不同
    if (isPortraitMobile()) {
        // 纵向布局下，切换对话列表的显示
        const conversationList = document.getElementById('conversationList');
        conversationList.classList.toggle('expanded');
        
        if (conversationList.classList.contains('expanded')) {
            toggleSidebarBtn.innerHTML = '<i class="fas fa-times"></i> <span>' + utils.t('hideSidebar') + '</span>';
        } else {
            toggleSidebarBtn.innerHTML = '<i class="fas fa-list"></i> <span>' + utils.t('toggleSidebar') + '</span>';
        }
    } else {
        // 横向布局下的正常逻辑
        sidebar.classList.toggle('collapsed');
        resizeHandle.classList.toggle('hidden');
        
        if (sidebar.classList.contains('collapsed')) {
            toggleSidebarBtn.innerHTML = '<i class="fas fa-list"></i> <span>' + utils.t('toggleSidebar') + '</span>';
        } else {
            toggleSidebarBtn.innerHTML = '<i class="fas fa-times"></i> <span>' + utils.t('hideSidebar') + '</span>';
        }
    }
}

// 切换内容区域显示/隐藏
function toggleContentArea() {
    contentArea.classList.toggle('collapsed');
    const conversationList = document.getElementById('conversationList');
    if (isPortraitMobile()) {
        if (contentArea.classList.contains('collapsed')) {
            // 折叠正文时扩展对话列表覆盖正文区域
            if (conversationList.classList.contains('expanded')) {
                conversationList.classList.add('cover-content');
            }
            toggleContentBtn.innerHTML = '<i class="fas fa-file-alt"></i> <span>' + utils.t('toggleContent') + '</span>';
        } else {
            // 展开正文时恢复对话列表原状
            conversationList.classList.remove('cover-content');
            toggleContentBtn.innerHTML = '<i class="fas fa-times"></i> <span>' + utils.t('hideContent') + '</span>';
        }
    } else {
        if (contentArea.classList.contains('collapsed')) {
            toggleContentBtn.innerHTML = '<i class="fas fa-file-alt"></i> <span>' + utils.t('toggleContent') + '</span>';
        } else {
            toggleContentBtn.innerHTML = '<i class="fas fa-times"></i> <span>' + utils.t('hideContent') + '</span>';
        }
    }
}

// 自动折叠上传区域
window.autoCollapseUploadSection = function() {
    closeUploadModal();
    // 加载数据后自动展开内容区域
    contentArea.classList.remove('collapsed');
    // 纵向布局下加载完成后展开对话列表
    if (isPortraitMobile()) {
        const conversationList = document.getElementById('conversationList');
        conversationList.classList.add('expanded');
        toggleSidebarBtn.innerHTML = '<i class="fas fa-times"></i> <span>' + utils.t('hideSidebar') + '</span>';
    }
    toggleContentBtn.innerHTML = '<i class="fas fa-times"></i> <span>' + utils.t('hideContent') + '</span>';
};

// 长宽比判断
function isPortraitMobile() {
    return window.innerHeight > window.innerWidth;
}

// 页面加载和窗口变化时自动调整 sidebar
function adjustSidebarForMobile() {
    if (isPortraitMobile()) {
        sidebar.style.overflowY = 'auto';
        sidebar.style.width = '100%';
        sidebar.style.display = '';
        document.querySelector('.main-container').style.flexDirection = 'column';
        document.querySelector('.resize-handle').style.display = 'none';
        toggleSidebarBtn.style.display = 'block';
        toggleContentBtn.style.display = 'block';

        const conversationList = document.getElementById('conversationList');
        if (contentArea.classList.contains('collapsed')) {
            if (conversationList.classList.contains('expanded')) {
                conversationList.classList.add('cover-content');
            }
        } else {
            conversationList.classList.remove('cover-content');
        }
        contentArea.classList.remove('collapsed');
        toggleContentBtn.innerHTML = '<i class="fas fa-times"></i> <span>' + utils.t('hideContent') + '</span>';
    } else {
        sidebar.style.overflowY = '';
        sidebar.style.width = '';
        sidebar.style.display = '';
        document.querySelector('.main-container').style.flexDirection = '';
        document.querySelector('.resize-handle').style.display = '';
        toggleContentBtn.style.display = 'none';
        document.getElementById('conversationList').classList.remove('cover-content');
        contentArea.classList.remove('collapsed');
    }
}

// 保存模态窗口逻辑
function openSaveModal() {
    saveModal.classList.add('active');
    saveModalOverlay.classList.add('active');
}
function closeSaveModalFn() {
    saveModal.classList.remove('active');
    saveModalOverlay.classList.remove('active');
}

// 保存前准备函数
function prepareForSave() {
    // 确保保存模态窗口是关闭的
    saveModal.classList.remove('active');
    saveModalOverlay.classList.remove('active');
    
    // 确保上传模态窗口是关闭的
    uploadModal.classList.remove('active');
    modalOverlay.classList.remove('active');
    
    return true;
}

// 清除事件监听器
function clearEventListeners() {
    eventListeners.forEach(({element, type, listener}) => {
        element.removeEventListener(type, listener);
    });
    eventListeners = [];
}

// 添加事件监听器（便于管理）
function addEventListener(element, type, listener) {
    element.addEventListener(type, listener);
    eventListeners.push({element, type, listener});
}

// 处理文件上传
function handleFileUpload(file) {
    if (file.type !== 'application/json') {
        alert(utils.t('invalidFileType'));
        return;
    }
    showLoading();
    const reader = new FileReader();
    reader.onload = function(e) {
        // 使用setTimeout确保UI有机会更新
        setTimeout(() => {
            try {
                const data = JSON.parse(e.target.result);
                jsonInput.value = JSON.stringify(data, null, 2);
                conversationsData = data;
                applyFilters();
                hideLoading();
                window.autoCollapseUploadSection(); // 解析成功后关闭模态窗口
            } catch (error) {
                hideLoading();
                alert(utils.t('jsonParseError') + error.message);
            }
        }, 50);
    };
    reader.onerror = function() {
        hideLoading();
        alert(utils.t('fileReadError'));
    };
    reader.readAsText(file);
}

// 排序对话
function sortConversations(data) {
    const sortedData = [...data];
    
    switch (conversationFilters.sortBy) {
        case 'newest':
            sortedData.sort((a, b) => new Date(b.inserted_at) - new Date(a.inserted_at));
            break;
        case 'oldest':
            sortedData.sort((a, b) => new Date(a.inserted_at) - new Date(b.inserted_at));
            break;
        case 'title':
            sortedData.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            break;
    }
    
    return sortedData;
}

// 应用筛选条件
function applyFilters() {
    if (conversationsData.length === 0) return;
    
    showLoading();
    
    // 使用requestAnimationFrame避免阻塞UI
    requestAnimationFrame(() => {
        const filteredConversations = conversationsData.filter(conversation => {
            // 日期筛选
            const insertedDate = new Date(conversation.inserted_at);
            if (conversationFilters.dateRange.start && insertedDate < conversationFilters.dateRange.start) {
                return false;
            }
            if (conversationFilters.dateRange.end) {
                const filterEndDate = new Date(conversationFilters.dateRange.end);
                filterEndDate.setHours(23, 59, 59, 999);
                if (insertedDate > filterEndDate) {
                    return false;
                }
            }
            
            // 搜索筛选
            if (conversationFilters.search) {
                const titleMatch = conversation.title && conversation.title.toLowerCase().includes(conversationFilters.search);
                
                let contentMatch = false;
                // 检查对话内容是否匹配
                if (conversation.mapping) {
                    for (const key in conversation.mapping) {
                        const node = conversation.mapping[key];
                        if (node.message && node.message.fragments) {
                            for (const fragment of node.message.fragments) {
                                if (fragment.content && fragment.content.toLowerCase().includes(conversationFilters.search)) {
                                    contentMatch = true;
                                    break;
                                }
                            }
                        }
                        if (contentMatch) break;
                    }
                }
                
                if (!titleMatch && !contentMatch) {
                    return false;
                }
            }
            
            return true;
        });
        
        // 排序
        const sortedConversations = sortConversations(filteredConversations);
        
        // 使用文档碎片提高性能
        const fragment = document.createDocumentFragment();
        renderConversations(sortedConversations, fragment);
        conversationsContainer.innerHTML = '';
        conversationsContainer.appendChild(fragment);
        
        updateSearchStats();
        conversationCount.textContent = utils.t('conversationCount', { count: sortedConversations.length });
        
        hideLoading();
    });
}

// 更新搜索统计
function updateSearchStats() {
    let totalMatches = 0;
    
    // 计算标题中的匹配数
    const conversationItems = document.querySelectorAll('.conversation-item');
    conversationItems.forEach((item) => {
        const title = item.querySelector('.conversation-title').textContent;
        if (title.toLowerCase().includes(conversationFilters.search)) {
            totalMatches++;
        }
    });
    
    // 计算内容中的匹配数
    if (currentConversation && conversationFilters.search) {
        const contentElements = document.querySelectorAll('.conversation-detail .highlight');
        totalMatches += contentElements.length;
    }
    
    searchStats.setAttribute('data-count', totalMatches);
    searchStats.textContent = utils.t('searchResults', { count: totalMatches });
}

// 渲染对话列表
function renderConversations(data, container) {
    if (!Array.isArray(data) || data.length === 0) {
        container.innerHTML = '';
        const noResults = document.createElement('div');
        noResults.style.padding = '20px';
        noResults.style.textAlign = 'center';
        noResults.style.color = '#777';
        noResults.textContent = utils.t('noConversations');
        container.appendChild(noResults);
        return;
    }
    container.innerHTML = ''; // 只清空 conversationsContainer
    data.forEach((conversation) => {
        const conversationItem = document.createElement('div');
        conversationItem.className = 'conversation-item';
        conversationItem.dataset.id = conversation.id;
        conversationItem.tabIndex = 0; // 使可聚焦
        
        const filterStartDate = new Date(conversation.inserted_at);
        const filterEndDate = new Date(conversation.updated_at);
        
        // 格式化时间显示
        const timeFormat = { 
            start: utils.formatDateTime(filterStartDate), 
            end: utils.formatDateTime(filterEndDate) 
        };
        
        // 高亮搜索关键词
        let titleHtml = conversation.title || utils.t('noTitle');
        if (conversationFilters.search) {
            titleHtml = utils.highlightText(titleHtml, conversationFilters.search);
        }
        
        conversationItem.innerHTML = `
            <div class="conversation-title editable" data-id="${conversation.id}">${titleHtml}</div>
            <div class="conversation-time">${timeFormat.start} - ${timeFormat.end}</div>
            <div class="conversation-actions">
                <button class="edit-conversation-btn" title="${utils.t('editTitle')}"><i class="fas fa-edit"></i></button>
                <button class="delete-conversation-btn btn-danger" title="${utils.t('deleteConversation')}"><i class="fas fa-trash"></i></button>
            </div>
        `;
        
        // 添加点击事件
        const clickHandler = () => {
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
            });
            conversationItem.classList.add('active');
            currentConversation = conversation;
            renderconversationDetailContainer(conversation);
        };
        
        conversationItem.addEventListener('click', clickHandler);
        
        // 添加键盘事件
        conversationItem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                clickHandler();
            }
        });
        
        // 添加编辑按钮事件
        const editBtn = conversationItem.querySelector('.edit-conversation-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editConversationTitle(conversation);
        });
        
        // 添加删除按钮事件
        const deleteBtn = conversationItem.querySelector('.delete-conversation-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteConversation(conversation);
        });
        
        // 添加双击编辑事件
        const titleElement = conversationItem.querySelector('.conversation-title');
        titleElement.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            editConversationTitle(conversation);
        });
        
        container.appendChild(conversationItem);
    });
}

// 编辑对话标题
function editConversationTitle(conversation) {
    const titleElement = document.querySelector(`.conversation-item[data-id="${conversation.id}"] .conversation-title`);
    const originalTitle = conversation.title || utils.t('noTitle');
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalTitle;
    input.className = 'edit-input';
    
    titleElement.innerHTML = '';
    titleElement.appendChild(input);
    input.focus();
    
    function saveTitle() {
        const newTitle = input.value.trim();
        conversation.title = newTitle || utils.t('noTitle');
        
        // 更新标题显示
        titleElement.innerHTML = utils.highlightText(conversation.title, conversationFilters.search);
        
        // 如果当前正在查看这个对话，更新详情页标题
        if (currentConversation && currentConversation.id === conversation.id) {
            const detailTitle = document.getElementById('conversationTitle');
            if (detailTitle) {
                detailTitle.textContent = conversation.title;
            }
        }
        
        // 保存修改到本地存储
        saveConversationsToStorage();
    }
    
    input.addEventListener('blur', saveTitle);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            input.blur();
        } else if (e.key === 'Escape') {
            titleElement.innerHTML = utils.highlightText(originalTitle, conversationFilters.search);
        }
    });
}

// 删除对话
function deleteConversation(conversation) {
    if (confirm(utils.t('confirmDeleteConversation'))) {
        const index = conversationsData.findIndex(c => c.id === conversation.id);
        if (index !== -1) {
            conversationsData.splice(index, 1);
            
            // 更新UI
            applyFilters();
            
            // 如果删除的是当前正在查看的对话，清空详情区域
            if (currentConversation && currentConversation.id === conversation.id) {
                conversationDetailContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #777;"><i class="fas fa-comment-dots" style="font-size: 48px;"></i><p>' + utils.t('selectConversation') + '</p></div>';
                currentConversation = null;
            }
            
            // 保存修改到本地存储
            saveConversationsToStorage();
        }
    }
}

// 删除分支
function deleteBranch(conversation, nodeId, branchIndex) {
    if (confirm(utils.t('confirmDeleteBranch'))) {
        const node = conversation.mapping[nodeId];
        if (node && node.children && node.children.length > branchIndex) {
            // 删除分支
            node.children.splice(branchIndex, 1);
            
            // 如果删除后没有子节点了，移除这个节点
            if (node.children.length === 0) {
                delete conversation.mapping[nodeId];
            }
            
            // 重新渲染对话详情
            renderconversationDetailContainer(conversation);
            
            // 保存修改到本地存储
            saveConversationsToStorage();
        }
    }
}

// 保存对话到本地存储
function saveConversationsToStorage() {
    try {
        localStorage.setItem('deepseekConversations', JSON.stringify(conversationsData));
    } catch (e) {
        console.error('保存对话到本地存储失败:', e);
    }
}

// 从本地存储加载对话
function loadConversationsFromStorage() {
    try {
        const savedConversations = localStorage.getItem('deepseekConversations');
        if (savedConversations) {
            return JSON.parse(savedConversations);
        }
    } catch (e) {
        console.error('从本地存储加载对话失败:', e);
    }
    return null;
}

// 渲染对话详情
function renderconversationDetailContainer(conversation) {
    // 使用requestAnimationFrame提高性能
    requestAnimationFrame(() => {
        conversationDetailContainer.innerHTML = `
            <div class="conversation-header">
                <div>
                    <h2 id="conversationTitle" class="editable" title="${utils.t('editTitle')}">${conversation.title || utils.t('noTitle')}</h2>
                    <p class="timestamp">
                        <i class="far fa-clock"></i> 
                        ${utils.t('startTime')}${utils.formatDateTime(new Date(conversation.inserted_at))} | 
                        ${utils.t('endTime')}${utils.formatDateTime(new Date(conversation.updated_at))}
                    </p>
                </div>
                <div class="conversation-header-actions">
                    <button id="editTitleBtn" class="edit-title-btn"><i class="fas fa-edit"></i> ${utils.t('editTitle')}</button>
                    <button id="deleteConversationBtn" class="delete-conversation-btn btn-danger"><i class="fas fa-trash"></i> ${utils.t('deleteConversation')}</button>
                </div>
            </div>
            <div id="conversationContent"></div>
        `;
        
        const contentContainer = document.getElementById('conversationContent');
        renderConversationNodes(conversation.mapping, contentContainer, 'root', []);
        
        // 添加编辑标题按钮事件
        const editTitleBtn = document.getElementById('editTitleBtn');
        editTitleBtn.addEventListener('click', () => {
            editDetailTitle(conversation);
        });
        
        // 添加删除对话按钮事件
        const deleteConversationBtn = document.getElementById('deleteConversationBtn');
        deleteConversationBtn.addEventListener('click', () => {
            deleteConversation(conversation);
        });
        
        // 添加正文标题编辑功能
        const titleElement = document.getElementById('conversationTitle');
        titleElement.addEventListener('dblclick', () => {
            editDetailTitle(conversation);
        });
        
        // 增强代码块
        enhanceCodeBlocks();
        
        // 更新搜索统计
        updateSearchStats();
    });
}

// 专门用于编辑正文标题的函数
function editDetailTitle(conversation) {
    const titleElement = document.getElementById('conversationTitle');
    const originalTitle = conversation.title || utils.t('noTitle');
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalTitle;
    input.className = 'edit-input';
    
    titleElement.innerHTML = '';
    titleElement.appendChild(input);
    input.focus();
    
    function saveTitle() {
        const newTitle = input.value.trim();
        conversation.title = newTitle || utils.t('noTitle');
        
        // 更新标题显示
        titleElement.textContent = conversation.title;
        
        // 更新对话列表中的标题
        const listTitle = document.querySelector(`.conversation-item[data-id="${conversation.id}"] .conversation-title`);
        if (listTitle) {
            listTitle.textContent = conversation.title;
        }
        
        // 保存修改到本地存储
        saveConversationsToStorage();
    }
    
    input.addEventListener('blur', saveTitle);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            input.blur();
        } else if (e.key === 'Escape') {
            titleElement.textContent = originalTitle;
        }
    });
}

// 渲染对话内容（平铺结构）
function renderConversationNodes(mapping, container, nodeId, path) {
    const node = mapping[nodeId];
    if (!node || !node.children || node.children.length === 0) return;

    // 如果有多个分支，添加分支导航
    if (node.children.length > 1) {
        const branchNav = document.createElement('div');
        branchNav.className = 'branch-navigation';

        // 优先读取当前分支状态
        const branchKey = nodeId + '-' + path.join('-');
        let currentBranchIndex = branchNavigationIndex[branchKey];
        if (typeof currentBranchIndex !== 'number' || currentBranchIndex < 0 || currentBranchIndex >= node.children.length) {
            currentBranchIndex = 0;
        }
        const currentPath = [...path.slice(0, -1), currentBranchIndex];

        branchNavigationIndex[branchKey] = currentBranchIndex;

        branchNav.innerHTML = `
            <button class="branch-nav-btn prev-branch" ${currentBranchIndex === 0 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
            <input type="number" class="branch-input" value="${currentBranchIndex + 1}" min="1" max="${node.children.length}" aria-label="Current branch">
            <span class="branch-total">/ ${node.children.length}</span>
            <button class="branch-nav-btn next-branch" ${currentBranchIndex === node.children.length - 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
            <button class="branch-nav-del-btn delete-branch btn-danger" title="${utils.t('deleteBranch')}">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        const branchInput = branchNav.querySelector('.branch-input');
        const prevBtn = branchNav.querySelector('.prev-branch');
        const nextBtn = branchNav.querySelector('.next-branch');
        const deleteBtn = branchNav.querySelector('.delete-branch');
        
        // 输入框变化事件
        branchInput.addEventListener('change', () => {
            let value = parseInt(branchInput.value);
            if (isNaN(value) || value < 1) value = 1;
            if (value > node.children.length) value = node.children.length;
            
            branchInput.value = value;
            const newPath = [...path.slice(0, -1), value - 1];
            branchNavigationIndex[branchKey] = value - 1;
            renderBranch(mapping, container, node.children[value - 1], newPath, node.children.length);
        });
        
        // 上一分支事件
        prevBtn.addEventListener('click', () => {
            let idx = branchNavigationIndex[branchKey];
            if (typeof idx !== 'number') idx = 0;
            if (idx > 0) {
                const newPath = [...path.slice(0, -1), idx - 1];
                branchNavigationIndex[branchKey] = idx - 1;
                renderBranch(mapping, container, node.children[idx - 1], newPath, node.children.length);
            }
        });
        
        // 下一分支事件
        nextBtn.addEventListener('click', () => {
            let idx = branchNavigationIndex[branchKey];
            if (typeof idx !== 'number') idx = 0;
            if (idx < node.children.length - 1) {
                const newPath = [...path.slice(0, -1), idx + 1];
                branchNavigationIndex[branchKey] = idx + 1;
                renderBranch(mapping, container, node.children[idx + 1], newPath, node.children.length);
            }
        });
        
        // 删除分支事件
        deleteBtn.addEventListener('click', () => {
            deleteBranch(currentConversation, nodeId, currentBranchIndex);
        });
        
        container.appendChild(branchNav);
        
        // 默认显示当前分支
        renderBranch(mapping, container, node.children[currentBranchIndex], currentPath, node.children.length);
    } else {
        // 只有一个分支，直接显示
        renderBranch(mapping, container, node.children[0], [...path, 0], 1);
    }
}

// 渲染分支
function renderBranch(mapping, container, nodeId, path, totalBranches) {
    // 清除之前的内容
    const existingContent = container.querySelector('.branch-content');
    if (existingContent) {
        existingContent.remove();
    }
    
    const branchContent = document.createElement('div');
    branchContent.className = 'branch-content';
    container.appendChild(branchContent);
    
    let currentNodeId = nodeId;
    while (currentNodeId) {
        const currentNode = mapping[currentNodeId];
        if (!currentNode || !currentNode.message) break;
        
        const messageNode = document.createElement('div');
        messageNode.className = 'message';
        
        const model = currentNode.message.model;
        const insertedAt = new Date(currentNode.message.inserted_at);
        
        // 处理多个fragments
        let fragmentsHtml = '';
        if (currentNode.message.fragments && currentNode.message.fragments.length > 0) {
            let firstFragment = true;
            
            currentNode.message.fragments.forEach(fragment => {
                if (!firstFragment) {
                    fragmentsHtml += '<div class="fragment-divider"></div>';
                }
                
                let fragmentContent = fragment.content || '';
                // 高亮搜索关键词
                if (conversationFilters.search && fragmentContent) {
                    fragmentContent = utils.highlightText(fragmentContent, conversationFilters.search);
                }
                
                fragmentsHtml += `
                    <div class="fragment ${fragment.type.toLowerCase()}">
                        <div class="fragment-header">
                            <span>${fragment.type}</span>
                            <span class="timestamp">${utils.formatDateTime(insertedAt)}</span>
                        </div>
                        <div class="fragment-content">
                            ${renderFragmentContent(fragment, fragmentContent)}
                        </div>
                    </div>
                `;
                
                firstFragment = false;
            });
        }
        
        messageNode.innerHTML = `
            <div class="message-header">
                <div>
                    ${getMessageTypeText(currentNode.message.fragments)}
                    <span class="model-tag ${model === 'deepseek-reasoner' ? 'reasoner' : 'chat'}">
                        ${model}
                    </span>
                </div>
                <div class="timestamp">
                    ${utils.formatDateTime(insertedAt)}
                </div>
            </div>
            <div class="message-content">
                ${fragmentsHtml}
            </div>
        `;
        
        branchContent.appendChild(messageNode);
        
        // 检查是否有子节点
        if (currentNode.children && currentNode.children.length > 0) {
            // 如果有多个子节点，递归处理分支
            if (currentNode.children.length > 1) {
                const childContainer = document.createElement('div');
                branchContent.appendChild(childContainer);
                renderConversationNodes(mapping, childContainer, currentNodeId, path);
                break;
            } else {
                // 只有一个子节点，继续处理
                currentNodeId = currentNode.children[0];
            }
        } else {
            currentNodeId = null;
        }
    }
    
    // 更新分支导航按钮状态
    updateBranchNavigation(container, path, totalBranches);
}

// 更新分支导航按钮状态
function updateBranchNavigation(container, path, totalBranches) {
    const branchNav = container.querySelector('.branch-navigation');
    if (!branchNav) return;
    
    const currentBranchIndex = path[path.length - 1];
    const prevBtn = branchNav.querySelector('.prev-branch');
    const nextBtn = branchNav.querySelector('.next-branch');
    const branchInput = branchNav.querySelector('.branch-input');
    
    // 更新输入框值
    branchInput.value = currentBranchIndex + 1;
    
    // 更新按钮状态
    prevBtn.disabled = currentBranchIndex === 0;
    nextBtn.disabled = currentBranchIndex === totalBranches - 1;
}

// 获取消息类型文本
function getMessageTypeText(fragments) {
    if (!fragments || fragments.length === 0) return utils.t('unknownType');
    
    const types = fragments.map(f => f.type);
    return types.join(' + ');
}

// 渲染片段内容
function renderFragmentContent(fragment, content) {
    if (!fragment) return '<em>' + utils.t('noContent') + '</em>';
    
    switch (fragment.type) {
        case 'REQUEST':
            // 对REQUEST内容进行HTML转义，防止XSS和错误渲染
            const escapedContent = utils.escapeHtml(content || '');
            return `<div style="white-space: pre-wrap;">${escapedContent}</div>`;
            
        case 'RESPONSE':
        case 'THINK':
            return marked.parse(content || '');
        
        case 'SEARCH':
            if (fragment.results && Array.isArray(fragment.results)) {
                return fragment.results.map(result => {
                    let title = result.title || '';
                    let snippet = result.snippet || '';
                    
                    // 高亮搜索关键词
                    if (conversationFilters.search) {
                        title = utils.highlightText(title, conversationFilters.search);
                        snippet = utils.highlightText(snippet, conversationFilters.search);
                    }
                    
                    return `
                        <div class="search-result">
                            <div class="search-title">
                                <a href="${result.url}" target="_blank">${title}</a>
                            </div>
                            <div class="search-snippet">${snippet}</div>
                            <div class="timestamp">
                                ${result.published_at ? new Date(result.published_at * 1000).toLocaleDateString() : utils.t('unknownDate')} | 
                                ${result.site_name || utils.t('unknownSource')}
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                return `<pre>${JSON.stringify(fragment, null, 2)}</pre>`;
            }
        
        default:
            if (fragment.content) {
                return `<pre>${JSON.stringify(fragment, null, 2)}</pre>`;
            } else {
                return `<pre>${JSON.stringify(fragment, null, 2)}</pre>`;
            }
    }
}

// 添加代码块操作功能
function enhanceCodeBlocks() {
    document.querySelectorAll('pre code').forEach(block => {
        const pre = block.parentElement;
        if (!pre.parentElement.classList.contains('code-block')) {
            const codeBlock = document.createElement('div');
            codeBlock.className = 'code-block';
            pre.parentElement.insertBefore(codeBlock, pre);
            
            // 获取语言类型
            let language = utils.getLanguageFromClass(block.className);
            if (language === 'txt') {
                // 自动检测语言
                language = utils.detectCodeLanguage(block.textContent);
                block.className = `language-${language}`;
            }
            
            // 重新高亮代码
            hljs.highlightElement(block);
            
            // 获取文件扩展名
            const fileExtension = utils.getFileExtension(language);
            
            // 创建代码头部
            const codeHeader = document.createElement('div');
            codeHeader.className = 'code-header';
            codeHeader.innerHTML = `
                <span>${language.toUpperCase()}</span>
                <div class="code-actions">
                    <button class="code-btn copy-code">${utils.t('copyCode')}</button>
                    <button class="code-btn download-code">${utils.t('downloadCode')}</button>
                </div>
            `;
            
            codeBlock.appendChild(codeHeader);
            codeBlock.appendChild(pre);
            
            // 复制代码功能
            const copyBtn = codeHeader.querySelector('.copy-code');
            copyBtn.addEventListener('click', function(e) {
                const code = block.innerText;
                navigator.clipboard.writeText(code).then(() => {
                    const originalText = e.target.textContent;
                    e.target.textContent = utils.t('copied');
                    setTimeout(() => {
                        e.target.textContent = originalText;
                    }, 2000);
                });
            });
            
            // 下载代码功能
            const downloadBtn = codeHeader.querySelector('.download-code');
            downloadBtn.addEventListener('click', function(e) {
                const code = block.innerText;
                const blob = new Blob([code], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `code.${fileExtension}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        }
    });
}

// 重新绑定对话项事件
function bindConversationItemEvents() {
    document.querySelectorAll('.conversation-item').forEach(item => {
        const conversationId = item.dataset.id;
        const conversation = conversationsData.find(c => c.id === conversationId);
        if (!conversation) return;
        
        // 重新绑定点击事件
        item.addEventListener('click', () => {
            document.querySelectorAll('.conversation-item').forEach(i => {
                i.classList.remove('active');
            });
            item.classList.add('active');
            currentConversation = conversation;
            renderconversationDetailContainer(conversation);
        });
        
        // 重新绑定编辑按钮事件
        const editBtn = item.querySelector('.edit-conversation-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                editConversationTitle(conversation);
            });
        }
        
        // 重新绑定删除按钮事件
        const deleteBtn = item.querySelector('.delete-conversation-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteConversation(conversation);
            });
        }
        
        // 重新绑定标题双击事件
        const titleElement = item.querySelector('.conversation-title');
        if (titleElement) {
            titleElement.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                editConversationTitle(conversation);
            });
        }
    });
}

// 绑定事件
function bindEvents() {
    // 模态窗口事件
    addEventListener(uploadModalBtn, 'click', openUploadModal);
    addEventListener(closeModal, 'click', closeUploadModal);
    addEventListener(modalOverlay, 'click', closeUploadModal);
    
    // 边栏和内容区域切换
    addEventListener(toggleSidebarBtn, 'click', toggleSidebar);
    addEventListener(toggleContentBtn, 'click', toggleContentArea);

    // 保存按钮事件
    addEventListener(saveBtn, 'click', openSaveModal);
    addEventListener(closeSaveModal, 'click', closeSaveModalFn);
    addEventListener(saveModalOverlay, 'click', closeSaveModalFn);

    // 拖放上传功能
    addEventListener(dropZone, 'click', () => fileInput.click());
    addEventListener(dropZone, 'dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#3498db';
        dropZone.style.backgroundColor = 'rgba(52, 152, 219, 0.1)';
    });
    addEventListener(dropZone, 'dragleave', () => {
        dropZone.style.borderColor = '#e0e0e0';
        dropZone.style.backgroundColor = 'transparent';
    });
    addEventListener(dropZone, 'drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#e0e0e0';
        dropZone.style.backgroundColor = 'transparent';
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    // 文件上传处理
    addEventListener(fileInput, 'change', (e) => {
        if (e.target.files.length) {
            handleFileUpload(e.target.files[0]);
        }
    });

    // JSON解析按钮
    addEventListener(parseButton, 'click', () => {
        const jsonText = jsonInput.value.trim();
        if (jsonText) {
            try {
                showLoading();
                // 使用setTimeout确保UI有机会更新
                setTimeout(() => {
                    const data = JSON.parse(jsonText);
                    conversationsData = data;
                    applyFilters();
                    hideLoading();
                    window.autoCollapseUploadSection(); // 解析成功后关闭模态窗口
                }, 50);
            } catch (error) {
                hideLoading();
                alert(utils.t('jsonParseError') + error.message);
            }
        } else {
            alert(utils.t('noJSONContent'));
        }
    });

    // 搜索和筛选事件监听
    addEventListener(searchInput, 'input', utils.debounce(() => {
        conversationFilters.search = searchInput.value.toLowerCase();
        applyFilters();
        updateSearchStats();
    }, 300));

    addEventListener(filterStartDate, 'change', () => {
        conversationFilters.dateRange.start = filterStartDate.value ? new Date(filterStartDate.value) : null;
        applyFilters();
    });

    addEventListener(filterEndDate, 'change', () => {
        conversationFilters.dateRange.end = filterEndDate.value ? new Date(filterEndDate.value) : null;
        applyFilters();
    });

    addEventListener(sortSelect, 'change', () => {
        conversationFilters.sortBy = sortSelect.value;
        applyFilters();
    });

    // 侧边栏宽度调整
    let isResizing = false;
    addEventListener(resizeHandle, 'mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    addEventListener(document, 'mousemove', (e) => {
        if (!isResizing) return;
        
        const containerRect = document.querySelector('.main-container').getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        
        if (newWidth > 200 && newWidth < containerRect.width * 0.7) {
            document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
        }
    });

    addEventListener(document, 'mouseup', () => {
        isResizing = false;
        document.body.style.cursor = '';
    });
}

// 初始化应用程序
function initApp() {
    // 获取DOM元素
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const jsonInput = document.getElementById('jsonInput');
    const parseButton = document.getElementById('parseButton');
    const conversationsContainer = document.getElementById('conversationsContainer');
    const conversationDetailContainer = document.getElementById('conversationDetailContainer');
    const searchInput = document.getElementById('searchInput');
    const filterStartDate = document.getElementById('filterStartDate');
    const filterEndDate = document.getElementById('filterEndDate');
    const sortSelect = document.getElementById('sortSelect');
    const resizeHandle = document.getElementById('resizeHandle');
    const themeToggle = document.getElementById('themeToggle');
    const saveBtn = document.getElementById('saveBtn');
    const printBtn = document.getElementById('printBtn');
    const resetBtn = document.getElementById('resetBtn');
    const searchStats = document.getElementById('searchStats');
    const conversationCount = document.getElementById('conversationCount');
    const loading = document.getElementById('loading');
    const sidebar = document.getElementById('sidebar');
    const contentArea = document.getElementById('contentArea');
    const uploadModal = document.getElementById('uploadModal');
    const modalOverlay = document.getElementById('modalOverlay');
    const closeModal = document.getElementById('closeModal');
    const uploadModalBtn = document.getElementById('uploadModalBtn');
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const toggleContentBtn = document.getElementById('toggleContentBtn');
    const saveModal = document.getElementById('saveModal');
    const saveModalOverlay = document.getElementById('saveModalOverlay');
    const closeSaveModal = document.getElementById('closeSaveModal');
    const saveOfflineBtn = document.getElementById('saveOfflineBtn');
    const saveHtmlBtn = document.getElementById('saveHtmlBtn');
    const saveJsonBtn = document.getElementById('saveJsonBtn');
    const languageSelect = document.getElementById('languageSelect');
    const saveOriginalBtn = document.getElementById('saveOriginalBtn');
    const saveOriginalGiteeBtn = document.getElementById('saveOriginalGiteeBtn');

    // 设置开始日期的默认日期，设置结束日期输入框的默认值为今天
    const today = new Date();
    const unixEpoch = new Date(1701218760000);
    
    filterStartDate.valueAsDate = unixEpoch;
    filterEndDate.valueAsDate = today;

    // 切换语言
    languageSelect.addEventListener('change', function() {
        const selectedLang = this.value;
        document.documentElement.setAttribute('lang', selectedLang);
        localStorage.setItem('preferredLanguage', selectedLang);
        utils.applyTranslations();
        
        // 重新渲染对话详情以更新翻译
        if (currentConversation) {
            renderconversationDetailContainer(currentConversation);
        }
    });

    // 切换主题
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const themeIcon = themeToggle.querySelector('i');
        const themeText = themeToggle.querySelector('span');
        if (currentTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'light');
            themeIcon.className = 'fas fa-moon';
            themeText.textContent = utils.t('darkMode');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeIcon.className = 'fas fa-sun';
            themeText.textContent = utils.t('lightMode');
        }
    });

    // 保存网页以离线使用（不保存对话）
    saveOfflineBtn.addEventListener('click', function() {
        if (!prepareForSave()) return;
        
        // 保存当前状态
        const currentConversationsData = [...conversationsData];
        const currentConversationDetail = conversationDetailContainer.innerHTML;
        const currentConversationsList = conversationsContainer.innerHTML;
        const currentJsonInputValue = jsonInput.value;
        
        // 清空对话数据
        conversationsData = [];
        conversationsContainer.innerHTML = '';
        conversationDetailContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #777;"><i class="fas fa-comment-dots" style="font-size: 48px;"></i><p>' + utils.t('selectConversation') + '</p></div>';
        jsonInput.value = '';
        
        // 使用setTimeout确保DOM更新
        setTimeout(() => {
            const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'Deepseek-Chat-Reader.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // 恢复状态
            conversationsData = currentConversationsData;
            conversationsContainer.innerHTML = currentConversationsList;
            conversationDetailContainer.innerHTML = currentConversationDetail;
            jsonInput.value = currentJsonInputValue;
            
            // 重新绑定事件
            bindConversationItemEvents();
        }, 100);
    });

    // 保存对话和阅读器为HTML（现有保存模式）
    saveHtmlBtn.addEventListener('click', function() {
        if (!prepareForSave()) return;
        
        setTimeout(() => {
            const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ExportConversations.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    });

    // 从GitHub下载最新版本
    saveOriginalBtn.addEventListener('click', function() {
        window.open('https://github.com/DeepSeek-Chat-Reader/DeepSeek-Chat-Reader.github.io/releases/latest', '_blank');
    });
    
    // 从Gitee下载
    saveOriginalGiteeBtn.addEventListener('click', function() {
        window.open('https://gitee.com/Short_Arm_Ape/DeepSeek-Chat-Reader/releases/latest', '_blank');
    });

    // 保存对话为JSON
    saveJsonBtn.addEventListener('click', function() {
        if (!conversationsData || conversationsData.length === 0) {
            alert(utils.t('noConversationsToSave'));
            return;
        }
        const blob = new Blob([JSON.stringify(conversationsData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'EditedConversations.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        closeSaveModalFn();
    });

    // 打印功能
    printBtn.addEventListener('click', () => {
        window.print();
    });

    // 重置应用
    resetBtn.addEventListener('click', () => {
        if (confirm(utils.t('confirmReset'))) {
            // 清除所有数据
            conversationsData = [];
            conversationFilters = {
                search: '',
                dateRange: {
                    start: null,
                    end: null
                },
                sortBy: 'newest'
            };
            // 清空本地存储
            localStorage.removeItem('deepseekConversations');
            // 重置UI
            jsonInput.value = '';
            searchInput.value = '';
            filterStartDate.valueAsDate = unixEpoch;
            filterEndDate.valueAsDate = today;
            sortSelect.value = 'newest';
            fileInput.value = '';
            
            // 清空容器
            conversationsContainer.innerHTML = ''; // 只清空 conversationsContainer
            conversationDetailContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #777;"><i class="fas fa-comment-dots" style="font-size: 48px;"></i><p>' + utils.t('selectConversation') + '</p></div>';
            
            // 更新统计
            searchStats.textContent = utils.t('searchResults', { count: 0 });
            conversationCount.textContent = utils.t('conversationCount', { count: 0 });
            
            // 清除事件监听器
            clearEventListeners();
            
            // 隐藏加载提示
            hideLoading();
            
            // 重新绑定事件
            bindEvents();
            
            // 打开上传模态窗口
            openUploadModal();
            
            // 折叠内容区域
            contentArea.classList.add('collapsed');
            toggleContentBtn.innerHTML = '<i class="fas fa-file-alt"></i> <span>' + utils.t('toggleContent') + '</span>';
            // 重置后展开对话列表（纵向布局）
            if (isPortraitMobile()) {
                const conversationList = document.getElementById('conversationList');
                conversationList.classList.add('expanded');
                toggleSidebarBtn.innerHTML = '<i class="fas fa-times"></i> <span>' + utils.t('hideSidebar') + '</span>';
            }
        }
    });

    // 初始化绑定事件
    bindEvents();
    window.addEventListener('resize', adjustSidebarForMobile);
    adjustSidebarForMobile();

    // 初始化主题和语言
    initTheme();
    initLanguage();
    
    // 尝试从本地存储加载对话
    const savedConversations = loadConversationsFromStorage();
    if (savedConversations) {
        conversationsData = savedConversations;
        applyFilters();
        contentArea.classList.remove('collapsed');
        toggleContentBtn.innerHTML = '<i class="fas fa-times"></i> <span>' + utils.t('hideContent') + '</span>';
        
        // 纵向布局下加载完成后展开对话列表
        if (isPortraitMobile()) {
            const conversationList = document.getElementById('conversationList');
            conversationList.classList.add('expanded');
            toggleSidebarBtn.innerHTML = '<i class="fas fa-times"></i> <span>' + utils.t('hideSidebar') + '</span>';
        }
    } else {
        // 页面加载时自动打开上传模态窗口
        openUploadModal();
        
        // 页面加载时自动折叠内容区域
        contentArea.classList.add('collapsed');
        toggleContentBtn.innerHTML = '<i class="fas fa-file-alt"></i> <span>' + utils.t('toggleContent') + '</span>';
        
        // 页面加载时展开对话列表（纵向布局）
        if (isPortraitMobile()) {
            const conversationList = document.getElementById('conversationList');
            conversationList.classList.add('expanded');
            toggleSidebarBtn.innerHTML = '<i class="fas fa-times"></i> <span>' + utils.t('hideSidebar') + '</span>';
        }
    }
}

// DOM加载完成后初始化应用程序
document.addEventListener('DOMContentLoaded', initApp);