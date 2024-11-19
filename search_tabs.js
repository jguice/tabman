function run(argv) {
    try {
        const query = argv[0].toLowerCase();
        const chrome = Application('Google Chrome');
        chrome.includeStandardAdditions = true;
        
        // Ensure Chrome is running
        if (!chrome.running()) {
            return JSON.stringify({
                items: [{
                    title: 'Chrome is not running',
                    subtitle: 'Please start Chrome first',
                    valid: false
                }]
            });
        }

        const results = [];
        
        // Get all windows from all Chrome profiles
        chrome.windows().forEach((window) => {
            try {
                window.tabs().forEach((tab) => {
                    try {
                        const title = tab.title() || '';
                        const url = tab.url() || '';
                        
                        // Search in both title and URL
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
                    } catch (tabError) {
                        console.log('Error processing tab: ' + tabError);
                    }
                });
            } catch (windowError) {
                console.log('Error processing window: ' + windowError);
            }
        });
        
        // If no results found, provide feedback
        if (results.length === 0) {
            results.push({
                title: 'No matching tabs found',
                subtitle: 'Try a different search term',
                valid: false
            });
        }
        
        return JSON.stringify({ items: results });
    } catch (error) {
        return JSON.stringify({
            items: [{
                title: 'Error: ' + error.message,
                subtitle: 'Please check if Chrome is accessible',
                valid: false
            }]
        });
    }
}
