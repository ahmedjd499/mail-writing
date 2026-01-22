# Share Target Fix Documentation

## Problem Statement

The app appeared in the Android/PWA share menu, but when clicked, it would open without populating the shared data into the input fields.

## Root Causes Identified

1. **Timing Issue**: Service worker would post a message to a newly opened window before the window's JavaScript had loaded and registered the message listener.

2. **Race Condition**: Using a static ID ('pending') meant multiple share requests could overwrite each other.

3. **No Fallback**: If the postMessage failed or arrived too early, the data was lost with no recovery mechanism.

4. **Large Image Memory Issues**: Converting large images to data URLs without size checks could cause memory issues.

## Solution Overview

The fix implements a **dual-path approach**:

### Path 1: Existing Window (Direct Message)
- For existing app instances, share data is sent directly via `postMessage`
- Fast and reliable since the listener is already registered
- No IndexedDB needed

### Path 2: New Window (IndexedDB + URL Parameter)
- For new windows, share data is stored in IndexedDB with a unique ID
- The unique ID is passed via URL parameter (`?source=share&shareId=xxx`)
- On page load, the app reads the `shareId` from URL and retrieves data from IndexedDB
- Data is cleaned up after successful retrieval

## Technical Implementation

### 1. Service Worker Changes (`service-worker.js`)

#### Added Functions:
- `openShareDB()`: Opens/creates the ShareTargetDB IndexedDB database
- `storeShareData(db, shareData)`: Stores share data with unique ID and timestamp
- `cleanupOldShareData()`: Removes share data older than 1 hour (runs on activate)

#### Modified Share Target Handler:
```javascript
// Generate unique ID
const shareId = 'share-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

// Check if existing window
if (existingClient) {
  // Direct message (fast path)
  client.postMessage(shareData);
} else {
  // Store in IndexedDB for new window
  await storeShareData(db, shareData);
  client = await clients.openWindow(scope + '?source=share&shareId=' + shareId);
}
```

#### Added Image Size Validation:
- Filters out files larger than 10MB before conversion
- Graceful error handling for individual file conversion failures
- Prevents memory issues with large images

### 2. Application Changes (`app.js`)

#### Added Functions:
- `checkPendingShareData(shareId)`: Retrieves share data from IndexedDB on load
- `handleShareData(data)`: Centralized function to process share data
- IndexedDB helper functions: `openShareDB()`, `getShareData()`, `deleteShareData()`

#### Modified DOMContentLoaded:
```javascript
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('source') === 'share') {
  const shareId = urlParams.get('shareId');
  await checkPendingShareData(shareId);
}
```

#### Improved Share Data Handling:
- Better error messages with user-facing toasts
- Support for both image and text in the same share
- Graceful handling of invalid or empty shares

## Key Improvements

### 1. Reliability
- **Unique IDs**: Each share gets a unique ID, preventing collision
- **Fallback Mechanism**: IndexedDB ensures data persists even if message is lost
- **Error Handling**: User-visible error messages for failed shares

### 2. Performance
- **Path Optimization**: Existing windows use fast postMessage path
- **Size Validation**: Large files filtered before processing
- **Automatic Cleanup**: Old share data removed automatically

### 3. User Experience
- **Better Feedback**: Toast notifications for all scenarios
- **Mixed Content**: Supports sharing both image and text together
- **Error Messages**: Clear feedback when something goes wrong

## Data Flow Diagrams

### Scenario 1: App Already Open
```
User shares content
    ↓
Service Worker receives POST
    ↓
Finds existing client window
    ↓
Focuses window + postMessage
    ↓
App receives message
    ↓
handleShareData() processes content
    ↓
Input fields populated
```

### Scenario 2: App Not Open (New Window)
```
User shares content
    ↓
Service Worker receives POST
    ↓
No existing client found
    ↓
Store data in IndexedDB (shareId: share-123-xyz)
    ↓
Open new window with ?source=share&shareId=share-123-xyz
    ↓
App loads, DOMContentLoaded fires
    ↓
Reads shareId from URL
    ↓
Retrieves data from IndexedDB
    ↓
handleShareData() processes content
    ↓
Input fields populated
    ↓
Delete share data from IndexedDB
```

## Testing Scenarios

### Test Case 1: Text Share (App Closed)
1. Share a LinkedIn post to the app
2. App should open with job description populated in textarea
3. Success toast should appear

### Test Case 2: Image Share (App Closed)
1. Share a screenshot to the app
2. App should open with image preview visible
3. Success toast should appear

### Test Case 3: Text Share (App Open)
1. Have app open in background
2. Share a LinkedIn post
3. App should focus and populate textarea
4. Success toast should appear

### Test Case 4: Large Image (>10MB)
1. Share a very large image
2. App should open with warning about file size
3. No crash or memory issues

### Test Case 5: Mixed Content
1. Share content with both image and text
2. Both should be populated
3. Toast should say "image and text received"

### Test Case 6: Empty Share
1. Share with no content
2. App should show warning toast
3. No silent failure

## IndexedDB Schema

### Database: ShareTargetDB
- **Version**: 1
- **Object Store**: 'shares'
- **Key Path**: 'id'

### Record Structure:
```javascript
{
  id: 'share-1234567890-abc123',  // Unique identifier
  type: 'share-target',            // Always 'share-target'
  shareId: 'share-1234567890-abc123', // Same as id
  title: 'Job Post Title',         // Optional
  text: 'Job description...',      // Optional
  url: 'https://...',              // Optional
  files: [],                       // Raw File objects (usually empty)
  serializedFiles: [{              // Serialized image data
    name: 'screenshot.png',
    type: 'image/png',
    size: 123456,
    dataUrl: 'data:image/png;base64,...'
  }],
  timestamp: 1234567890000         // For cleanup
}
```

## Maintenance Notes

### Automatic Cleanup
- Service worker activates → cleans up entries older than 1 hour
- Prevents database bloat from unclaimed shares
- Runs automatically, no manual intervention needed

### Error Recovery
- All IndexedDB operations wrapped in try-catch
- Failed operations logged but don't crash the app
- User sees appropriate error toast

### Browser Compatibility
- Uses standard IndexedDB API (widely supported)
- Web Share Target API (PWA required)
- Service Worker API (modern browsers)

## Future Improvements

1. **Multiple Images**: Currently only first image processed
2. **Progress Indicators**: Show loading state during large file processing
3. **Retry Mechanism**: Auto-retry failed share attempts
4. **Share History**: Optional feature to view recently shared content
5. **Compression**: Compress large images before storing

## Debugging Tips

### Enable Debug Panel
- Triple-tap bottom-left corner of screen
- Shows debug logs from share operations
- Useful for troubleshooting

### Check IndexedDB
```javascript
// In browser console
indexedDB.databases().then(console.log);

// Open DB
const req = indexedDB.open('ShareTargetDB');
req.onsuccess = e => {
  const db = e.target.result;
  const tx = db.transaction(['shares'], 'readonly');
  const store = tx.objectStore('shares');
  store.getAll().onsuccess = e => console.log(e.target.result);
};
```

### Check Service Worker State
```javascript
// In browser console
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('SW state:', reg.active.state);
  console.log('SW scope:', reg.scope);
});
```

## Conclusion

The fix ensures reliable share target functionality by:
1. Using a dual-path approach (message vs IndexedDB)
2. Implementing unique IDs to prevent collisions
3. Adding comprehensive error handling
4. Validating input sizes
5. Providing clear user feedback

The solution is production-ready and handles edge cases gracefully.
