export function getAllPostsSorted(objects) {
    const allPosts = getAllPosts(objects);
    return sortPosts(allPosts);
}

export function getAllCategoryPostsSorted(objects, categoryId) {
    const allPosts = getAllPosts(objects);
    const categoryPosts = allPosts.filter((post) => post.category === categoryId);
    return sortPosts(categoryPosts);
}

export function getAllPosts(objects) {
    return objects.filter((object) => object.__metadata?.modelName === 'PostLayout');
}

export function getAllFeaturedPostsSorted(objects) {
    const allPosts = getAllPosts(objects);
    const featuredPosts = allPosts.filter((post) => post.isFeatured === true);
    return sortPosts(featuredPosts);
}

export function getAllNonFeaturedPostsSorted(objects) {
    const allPosts = getAllPosts(objects);
    const nonFeaturedPosts = allPosts.filter((post) => post.isFeatured !== true);
    return sortPosts(nonFeaturedPosts);
}

export function sortPosts(posts) {
    return posts.sort((postA, postB) => new Date(postB.date).getTime() - new Date(postA.date).getTime());
}

export function isPublished(page) {
    return !page.isDraft;
}

export function resolveReferences(object, fieldPaths, objects, debugContext = { keyPath: [], stack: [] }) {
    const _resolveDeep = (value, fieldNames, debugContext) => {
        if (typeof value === 'string') {
            const result = findObjectById(value, objects, debugContext);
            return _resolveDeep(result, fieldNames, debugContext);
        } else if (Array.isArray(value)) {
            return value
                .map((item, index) =>
                    _resolveDeep(item, fieldNames, {
                        keyPath: debugContext.keyPath.concat(index),
                        stack: debugContext.stack.concat([value])
                    })
                )
                .filter(Boolean);
        }

        if (!value || fieldNames.length === 0) {
            return value;
        }
        const [fieldName, ...tail] = fieldNames;
        if (!(fieldName in value)) {
            return value;
        }
        const result = _resolveDeep(value[fieldName], tail, {
            keyPath: debugContext.keyPath.concat(fieldName),
            stack: debugContext.stack.concat(value)
        });
        return {
            ...value,
            [fieldName]: result
        };
    };

    return fieldPaths.reduce((object, fieldPath) => {
        const fieldNames = fieldPath.split('.');
        return _resolveDeep(object, fieldNames, debugContext);
    }, object);
}

export function resolveReferenceField(object, fieldName, objects, debugContext = { keyPath: [], stack: [] }) {
    if (!(fieldName in object)) {
        return object;
    }
    const result = findObjectById(object[fieldName], objects, {
        keyPath: debugContext.keyPath.concat(fieldName),
        stack: debugContext.stack.concat(object)
    });
    return {
        ...object,
        [fieldName]: result
    };
}

export function resolveReferenceArray(object, fieldName, objects, debugContext) {
    if (!(fieldName in object)) {
        return object;
    }
    const result = mapObjectsById(object[fieldName], objects, {
        keyPath: debugContext.keyPath.concat(fieldName),
        stack: debugContext.stack.concat(object)
    });
    return {
        ...object,
        [fieldName]: result
    };
}

export function mapObjectsById(objectIds, objects, debugContext) {
    return (objectIds ?? [])
        .map((objectId, index) =>
            findObjectById(objectId, objects, {
                keyPath: debugContext.keyPath.concat(index),
                stack: debugContext.stack.concat([objectIds])
            })
        )
        .filter(Boolean);
}

export function findObjectById(objectId, objects, debugContext) {
    if (!objectId) {
        return null;
    }
    const object = objects.find((object) => object.__metadata?.id === objectId) || null;
    if (!object && debugContext) {
        const reverseStack = debugContext.stack.slice().reverse();
        const objectIndex = reverseStack.findIndex((object) => !!object.__metadata?.relProjectPath);
        if (objectIndex >= 0) {
            const filePath = reverseStack[objectIndex].__metadata.relProjectPath;
            const fieldPath = debugContext.keyPath
                .slice()
                .reverse()
                .slice(0, objectIndex + 1)
                .reverse()
                .join('.');
            console.warn(`The '${objectId}' referenced in file '${filePath}' in field '${fieldPath}' was not found`);
        }
    }
    return object;
}

export function getRootPagePath(pagePath) {
    const pagedPathMatch = pagePath.match(/\/page\/\d+$/);
    if (!pagedPathMatch) {
        return pagePath;
    }
    return pagePath.substring(0, pagedPathMatch.index);
}

export function generatePagedPathsForPage(page, items, numOfItemsPerPage) {
    const pageUrlPath = page.__metadata?.urlPath;
    if (numOfItemsPerPage === 0) {
        return [pageUrlPath];
    }
    const numOfPages = Math.ceil(items.length / numOfItemsPerPage) || 1;
    const paths = [];
    for (let i = 0; i < numOfPages; i++) {
        paths.push(i === 0 ? pageUrlPath : `${pageUrlPath}/page/${i + 1}`);
    }
    return paths;
}

export function getPagedItemsForPage(page, items, numOfItemsPerPage) {
    const pageUrlPath = page.__metadata?.urlPath;
    const baseUrlPath = getRootPagePath(pageUrlPath);
    if (numOfItemsPerPage === 0) {
        return {
            pageIndex: 0,
            baseUrlPath,
            numOfPages: 1,
            numOfTotalItems: items.length,
            items: items
        };
    }
    const pageIndexMatch = pageUrlPath.match(/\/page\/(\d+)$/);
    const pageIndex = pageIndexMatch ? parseInt(pageIndexMatch[1]) - 1 : 0;
    const numOfPages = Math.ceil(items.length / numOfItemsPerPage) || 1;
    const startIndex = pageIndex * numOfItemsPerPage;
    const endIndex = startIndex + numOfItemsPerPage;
    return {
        pageIndex,
        baseUrlPath,
        numOfPages: numOfPages,
        numOfTotalItems: items.length,
        items: items.slice(startIndex, endIndex)
    };
}

export async function mapDeepAsync(value, iteratee, options = {}) {
    const postOrder = options?.postOrder ?? false;
    async function _mapDeep(value, keyPath, stack) {
        if (!postOrder) {
            value = await iteratee(value, keyPath, stack);
        }
        const childrenIterator = (val, key) => {
            return _mapDeep(val, keyPath.concat(key), stack.concat([value]));
        };
        if (value && typeof value == 'object' && value.constructor === Object) {
            const res = {};
            for (const [key, val] of Object.entries(value)) {
                res[key] = await childrenIterator(val, key);
            }
            value = res;
        } else if (Array.isArray(value)) {
            value = await Promise.all(value.map(childrenIterator));
        }
        if (postOrder) {
            value = await iteratee(value, keyPath, stack);
        }
        return value;
    }
    return _mapDeep(value, [], []);
}

export function generateUniqueId() {
    /**
     * Generates a unique identifier using timestamp and random string.
     * Used for creating new IDs when cloning content objects.
     * 
     * @returns {string} A unique identifier in format "timestamp-random"
     */
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${timestamp}-${random}`;
}

export function updateSlugForClone(originalSlug, suffix = 'copy') {
    /**
     * Updates a slug to create a unique version for cloned content.
     * Handles different slug formats including root paths.
     * 
     * @param {string} originalSlug - The original slug to update
     * @param {string} suffix - The suffix to add (default: 'copy')
     * @returns {string} The updated slug with suffix
     */
    if (!originalSlug) {
        return `${suffix}-${generateUniqueId()}`;
    }
    
    // Handle different slug formats
    if (originalSlug === '/') {
        return `/${suffix}`;
    }
    
    // Remove leading slash if present for processing
    const cleanSlug = originalSlug.startsWith('/') ? originalSlug.substring(1) : originalSlug;
    
    // Add suffix to create unique slug
    const newSlug = cleanSlug ? `${cleanSlug}-${suffix}` : suffix;
    
    // Restore leading slash if original had it
    return originalSlug.startsWith('/') ? `/${newSlug}` : newSlug;
}

export function cloneObject(object, options = {}) {
    /**
     * Creates a deep clone of a content object with updated metadata.
     * Handles complex nested structures, arrays, and content-specific fields.
     * 
     * @param {Object} object - The object to clone
     * @param {Object} options - Cloning options
     * @param {boolean} options.updateIds - Whether to generate new IDs (default: true)
     * @param {boolean} options.updateSlug - Whether to update slug fields (default: true)
     * @param {string} options.idSuffix - Custom suffix for IDs (default: auto-generated)
     * @param {string} options.slugSuffix - Suffix for slugs (default: 'copy')
     * @param {boolean} options.updateTitle - Whether to update title field (default: true)
     * @param {string} options.titleSuffix - Suffix for titles (default: '(Copy)')
     * @returns {Object} The cloned object with updated metadata
     */
    const {
        updateIds = true,
        updateSlug = true,
        idSuffix = '',
        slugSuffix = 'copy',
        updateTitle = true,
        titleSuffix = '(Copy)'
    } = options;

    if (!object || typeof object !== 'object') {
        return object;
    }

    // Handle arrays
    if (Array.isArray(object)) {
        return object.map(item => cloneObject(item, options));
    }

    // Deep clone the object
    const cloned = {};
    
    for (const [key, value] of Object.entries(object)) {
        if (value === null || value === undefined) {
            cloned[key] = value;
        } else if (Array.isArray(value)) {
            cloned[key] = value.map(item => cloneObject(item, options));
        } else if (typeof value === 'object' && value.constructor === Object) {
            cloned[key] = cloneObject(value, options);
        } else {
            cloned[key] = value;
        }
    }

    // Handle metadata updates
    if (cloned.__metadata && updateIds) {
        cloned.__metadata = { ...cloned.__metadata };
        
        // Generate new unique ID
        const newId = idSuffix ? 
            `${cloned.__metadata.id}-${idSuffix}` : 
            `${cloned.__metadata.id}-${generateUniqueId()}`;
        cloned.__metadata.id = newId;
        
        // Update relProjectPath if it exists
        if (cloned.__metadata.relProjectPath) {
            const pathParts = cloned.__metadata.relProjectPath.split('/');
            const fileName = pathParts[pathParts.length - 1];
            const [name, ext] = fileName.split('.');
            const newFileName = idSuffix ? 
                `${name}-${idSuffix}.${ext}` : 
                `${name}-${generateUniqueId()}.${ext}`;
            pathParts[pathParts.length - 1] = newFileName;
            cloned.__metadata.relProjectPath = pathParts.join('/');
        }
        
        // Update urlPath if it exists
        if (cloned.__metadata.urlPath && updateSlug) {
            cloned.__metadata.urlPath = updateSlugForClone(cloned.__metadata.urlPath, slugSuffix);
        }
    }

    // Update slug field if it exists
    if (updateSlug && cloned.slug) {
        cloned.slug = updateSlugForClone(cloned.slug, slugSuffix);
    }

    // Update title if it exists
    if (updateTitle && cloned.title && typeof cloned.title === 'string') {
        cloned.title = `${cloned.title} ${titleSuffix}`;
    }

    return cloned;
}

export function cloneObjectWithReferences(object, allObjects, options = {}) {
    /**
     * Creates a clone of an object and optionally updates internal references.
     * Useful when cloning objects that reference other objects by ID.
     * 
     * @param {Object} object - The object to clone
     * @param {Array} allObjects - Array of all objects (for reference resolution)
     * @param {Object} options - Cloning options
     * @param {boolean} options.updateReferences - Whether to update reference IDs (default: false)
     * @param {Map} options.referenceMap - Map to track old ID -> new ID mappings
     * @returns {Object} The cloned object with optionally updated references
     */
    const {
        updateReferences = false,
        referenceMap = new Map(),
        ...cloneOptions
    } = options;

    // First, clone the object
    const cloned = cloneObject(object, cloneOptions);

    // If we're not updating references, return the clone as-is
    if (!updateReferences) {
        return cloned;
    }

    // Store the mapping of old ID to new ID
    if (object.__metadata?.id && cloned.__metadata?.id) {
        referenceMap.set(object.__metadata.id, cloned.__metadata.id);
    }

    // Recursively update any string fields that might be references
    function updateReferencesInObject(obj) {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => updateReferencesInObject(item));
        }

        const updated = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string' && referenceMap.has(value)) {
                // This string value is a reference to another object, update it
                updated[key] = referenceMap.get(value);
            } else if (typeof value === 'object') {
                updated[key] = updateReferencesInObject(value);
            } else {
                updated[key] = value;
            }
        }
        return updated;
    }

    return updateReferencesInObject(cloned);
}
