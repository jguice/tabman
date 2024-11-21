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
                const historyPath = `${profilesDir}/${String(ObjC.unwrap(dir))}/History`;
                console.log(`Checking history path: ${historyPath}`);
                return historyPath;
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
        
        // Create a temporary directory for copying history files
        const tempDir = '/tmp/tabman_history';
        try {
            if (!fm.fileExistsAtPath(tempDir)) {
                fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
                    tempDir, true, $(), null
                );
            }
        } catch (error) {
            console.log('Error creating temp directory: ' + error);
            return JSON.stringify({
                items: [{
                    title: 'Error creating temporary directory',
                    subtitle: error.message,
                    valid: false
                }]
            });
        }
        
        // Search through each profile's history
        profileDirs.forEach((historyFile, index) => {
            try {
                console.log('Processing history file:', historyFile);
                if (fm.fileExistsAtPath(historyFile)) {
                    // Copy history file to temp location (because Chrome locks the original)
                    const tempHistoryFile = `${tempDir}/History_${index}`;
                    try {
                        fm.copyItemAtPathToPathError(historyFile, tempHistoryFile, null);
                        
                        // Use sqlite3 to query the history
                        const task = $.NSTask.alloc.init;
                        const sqlitePath = '/usr/bin/sqlite3';
                        
                        // Check if sqlite3 is accessible
                        if (!fm.fileExistsAtPath(sqlitePath)) {
                            console.log('sqlite3 not found at:', sqlitePath);
                            throw new Error('sqlite3 not found');
                        }
                        
                        console.log('Executing sqlite3 query on:', tempHistoryFile);
                        task.setLaunchPath(sqlitePath);
                        task.setArguments([
                            tempHistoryFile,
                            `SELECT title, url 
                             FROM urls 
                             WHERE title LIKE '%${query}%' OR url LIKE '%${query}%' 
                             ORDER BY last_visit_time DESC 
                             LIMIT 20;`
                        ]);
                        
                        const pipe = $.NSPipe.pipe;
                        task.standardOutput = pipe;
                        task.standardError = pipe;
                        
                        try {
                            task.launch;
                            const data = pipe.fileHandleForReading.readDataToEndOfFile;
                            const output = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
                            console.log('Query output:', output);
                            
                            output.split('\n').forEach(line => {
                                if (line.trim()) {
                                    const [title, url] = line.split('|');
                                    if (title && url) {
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
                            });
                        } catch (e) {
                            console.log('Error executing sqlite3 query:', e);
                        } finally {
                            // Clean up temp file
                            if (fm.fileExistsAtPath(tempHistoryFile)) {
                                try {
                                    fm.removeItemAtPathError(tempHistoryFile, null);
                                } catch (e) {
                                    console.log('Error removing temp file: ' + e);
                                }
                            }
                        }
                    } catch (e) {
                        console.log('Error processing history file: ' + historyFile + ' - ' + e);
                    }
                } else {
                    console.log('History file does not exist:', historyFile);
                }
            } catch (error) {
                console.log('Error processing profile: ' + error);
            }
        });
        
        // Clean up temp directory if empty
        try {
            fm.removeItemAtPathError(tempDir, null);
        } catch (e) {
            console.log('Error removing temp directory: ' + e);
        }
        
        // If no results found, provide feedback
        if (results.length === 0) {
            results.push({
                title: 'No matching history entries found',
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
                subtitle: 'Please check if Chrome history is accessible',
                valid: false
            }]
        });
    }
}
