# Tabman 🦇

The Dark Knight of tab search tools - a lightning-fast Alfred workflow that prowls through your open tabs (Chrome, Brave, Arc, Ghostty), plus Chrome bookmarks and history.

## Features

- Search open tabs in Chrome, Brave, Arc & Ghostty (`tmt`)
- Search bookmarks (`tmb`)
- Search history (`tmh`)
- Works across all Chrome profiles (Default and custom profiles)
- No external dependencies required
- Fast and efficient search

## Installation

1. Download the latest release
2. Double click the `.alfredworkflow` file to install
3. Alfred will automatically install the workflow

## Usage

- `tmt <query>` - Search across all open Chrome, Arc & Ghostty tabs
- `tmb <query>` - Search bookmarks across your enabled browsers (Chrome, Brave, Arc)
- `tmh <query>` - Search history across your enabled browsers (Chrome, Brave, Arc)

## Configuration

Open the workflow in Alfred Preferences and click "Configure Workflow". One
checkbox per browser (Google Chrome, Brave Browser, Arc, Ghostty; all on by
default). Unchecking a browser removes it everywhere it appears: its tabs
from `tmt`, bookmarks from `tmb`, and history from `tmh`. Ghostty only has
tabs. History results are sorted by last visit time across all enabled
browsers.

## Requirements

- Alfred 5 with Powerpack
- Google Chrome, Brave, Arc, and/or Ghostty (apps that are not running are skipped)

## How it Works

The workflow uses native macOS scripting capabilities through JXA (JavaScript for Automation) to interact with Chrome. This means no additional dependencies are required!
