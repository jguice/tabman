function run(argv) {
    try {
        const query = argv[0].toLowerCase();
        const results = [];
        
        // Get Chrome's application support directory
        const homeDir = $.NSHomeDirectory().js;
        const profilesDir = `${homeDir}/Library/Application Support/Google/Chrome`;
        const fm = $.NSFileManager.defaultManager;
        
        // Check if Chrome profiles directory exists
        if (!fm.fileExistsAtPath(profilesDir)) {
            console.log('Chrome profiles directory not found:', profilesDir);
            return JSON.stringify({
                items: [{
                    title: 'Chrome profiles directory not found',
                    subtitle: 'Please make sure Chrome is installed',
                    valid: false
                }]
            });
        }
        
        // Find all profile directories
        const dirs = ObjC.unwrap(fm.contentsOfDirectoryAtPathError(profilesDir, null));
        console.log('Found directories:', dirs.map(d => String(ObjC.unwrap(d))));
        
        const profileDirs = dirs
            .filter(dir => {
                const dirName = String(ObjC.unwrap(dir));
                console.log(`Checking directory: ${dirName}`);
                return dirName.startsWith('Profile');
            })
            .map(dir => {
                const bookmarkPath = `${profilesDir}/${String(ObjC.unwrap(dir))}/Bookmarks`;
                console.log(`Checking bookmark path: ${bookmarkPath}`);
                return bookmarkPath;
            });
        
        console.log('Found profile directories:', profileDirs);
        
        if (profileDirs.length === 0) {
            return JSON.stringify({
                items: [{
                    title: 'No Chrome profiles found',
                    subtitle: 'Please make sure Chrome is properly set up',
                    valid: false
                }]
            });
        }
        
        // Search through each profile's bookmarks
        profileDirs.forEach(bookmarkFile => {
            try {
                console.log('Processing bookmark file:', bookmarkFile);
                if (fm.fileExistsAtPath(bookmarkFile)) {
                    console.log('Reading bookmark file:', bookmarkFile);
                    const bookmarkData = $.NSString.stringWithContentsOfFile(bookmarkFile).js;
                    if (bookmarkData) {
                        try {
                            const bookmarks = JSON.parse(bookmarkData);
                            console.log('Successfully parsed bookmarks');
                            searchBookmarkNode(bookmarks.roots.bookmark_bar, query, results);
                            searchBookmarkNode(bookmarks.roots.other, query, results);
                        } catch (e) {
                            console.log('Error parsing bookmark data:', e);
                        }
                    } else {
                        console.log('Failed to read bookmark file:', bookmarkFile);
                    }
                } else {
                    console.log('Bookmark file does not exist:', bookmarkFile);
                }
            } catch (error) {
                console.log('Error processing bookmark file: ' + bookmarkFile + ' - ' + error);
            }
        });
        
        // If no results found, provide feedback
        if (results.length === 0) {
            results.push({
                title: 'No matching bookmarks found',
                subtitle: 'Try a different search term',
                valid: false
            });
        }
        
        return JSON.stringify({ items: results });
    } catch (error) {
        console.log('Error:', error);
        return JSON.stringify({
            items: [{
                title: 'Error: ' + error.message,
                subtitle: 'Please check if Chrome bookmarks are accessible',
                valid: false
            }]
        });
    }
}

function searchBookmarkNode(node, query, results) {
    if (!node) return;
    
    if (node.type === 'url') {
        const title = node.name || '';
        const url = node.url || '';
        
        if (title.toLowerCase().includes(query) || url.toLowerCase().includes(query)) {
            results.push({
                title: title,
                subtitle: url,
                arg: url,
                text: {
                    copy: url,
                    largetype: title
                },
                quicklookurl: url
            });
        }
    }
    
    if (node.children) {
        node.children.forEach(child => {
            try {
                searchBookmarkNode(child, query, results);
            } catch (error) {
                console.log('Error processing bookmark node: ' + error);
            }
        });
    }
}
