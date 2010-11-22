var EXPORTED_SYMBOLS = ["ccffext"];

/**
 * An extension of the "Array" object's prototype. Inspired by Shamasis Bhattacharya's code
 *
 * @return array An array of unique items
 * @see http://www.shamasis.net/2009/09/fast-algorithm-to-find-unique-items-in-javascript-array/
 */
Array.prototype.unique = function()
{
	var object = {}, result = [];

    for(let i = 0; i < this.length; ++i)
    {
	    object[this[i]] = this[i];
    }

    for(let i in object)
    {
	    result.push(object[i]);
    }

    return result;
};

// Support for l10n of plurals
Components.utils.import("resource://gre/modules/PluralForm.jsm");

/**
 * Main extension object.
 * Behaves as a namespace for all code
 */
var ccffext =
{
	/**
	 * Localization object that is used to fetch localized strings from a property file
	 */
	l10n :
	{
		/**
		 * Bundle holding all strings
		 */
		bundle : Components.classes["@mozilla.org/intl/stringbundle;1"]
				.getService(Components.interfaces.nsIStringBundleService)
				.createBundle("chrome://ccffext/locale/locale.properties"),

		/**
		 * A lazy-initialized function for getting plurals
		 *
		 * @param number The number to be shown
		 * @param string A semicolon-separated string of plural forms containing the "%d" placeholders
		 * @return string A plural form with the placeholder substituted with the number
		 */
		getPlural : undefined,

		/**
		 * Fetched a string by its name from the bundle
		 *
		 * @param name The name of a string
		 * @return string A string
		 */
		get : function(name,number)
		{
			if ("undefined" == typeof number)
			{
				// No plural forms, just get the string
				return ccffext.l10n.bundle.GetStringFromName(name);
			}
			else
			{
				// Lazy-initialize the "getPlural" function
				if 	("undefined" == typeof ccffext.l10n.getPlural)
				{
					ccffext.l10n.getPlural = PluralForm
							.makeGetter(ccffext.l10n.bundle.GetStringFromName("l10n.plural.rule"))[0];
				}

				// Find appropriate plural form, substitute the placeholder
				return ccffext.l10n.getPlural(number,ccffext.l10n.bundle.GetStringFromName(name))
						.replace("%d",number);
			}
		}
	},

	/**
	 * Cache of analysed pages that is used to store the RDFa information.
	 * The "hashing" approach is used
	 *
	 * @see http://www.shamasis.net/2009/09/fast-algorithm-to-find-unique-items-in-javascript-array/
	 */
	cache :
	{
		/**
		 * The cache backend, initially empty
		 */
		values : {},

		/**
		 * Checks if the cache contains an object by its key
		 *
		 * @param key A key
		 * @return boolean True if the cache contains the object, false otherwise
		 */
		contains : function(key)
		{
			return undefined != ccffext.cache.values[key];
		},

		/**
		 * Stores a "key-object" pair in the cache
		 *
		 * @param key A key
		 * @param object An object
		 */
		put : function(key,object)
		{
			ccffext.cache.values[key] = object;
		},

		/**
		 * Fetches an object by its key from the cache
		 *
		 * @param key A key
		 */
		get : function(key)
		{
			return ccffext.cache.values[key];
		}
	},

	/**
	 * Licensed objects (RDFa subjects) methods
	 */
	objects :
	{
		/**
		 * Top-level predicates that mark licensed objects
		 */
		predicates :
		{
			"http://www.w3.org/1999/xhtml/vocab#" : ["copyright","license"]
		},

		/**
		 * Finds licensed objects in a page
		 *
		 * @param document The document containing licensed objects
		 * @return array Array of objects
		 */
		extract : function(document)
		{
			var subjects = [];

			let statements = statements = ccffext.cache.get(document.location.href).statements;
			for (let i = 0; i < statements.length; ++i)
			{
				for (let j in ccffext.objects.predicates)
				{
					for (let k = 0; k < ccffext.objects.predicates[j].length; ++k)
					{
						if (statements[i].predicate.uri == j + ccffext.objects.predicates[j][k])
						{
							subjects.push(statements[i].subject);
						}
					}
				}
			}

			return subjects.unique();
		},

		/**
		 * Returns an array of two-element "predicate-object" pairs for the licenced object (RDFa subject)
		 *
		 * @param document The document containing licensed objects
		 * @return subject The object (RDFa subject)
		 */
		getPairs : function(document,subject)
		{
			var pairs = [];

			let statements = statements = ccffext.cache.get(document.location.href).statements;
			for (let i = 0; i < statements.length; ++i)
			{
				if (statements[i].subject.uri == subject.uri)
				{
					pairs.push([statements[i].predicate,statements[i].object]);
				}
			}

			return pairs;
		},

		/**
		 * Parses RDFa data of the given document and stores it in the cache
		 *
		 * @param document The document to be parsed
		 * @param RDFA RDFA object
		 * @param XH XH object
		 */
		parse : function(location,document,RDFA,XH)
		{
			XH.transform(document.getElementsByTagName("body")[0]);
			XH.transform(document.getElementsByTagName("head")[0]);

			RDFA.reset();
			RDFA.parse(document);

			ccffext.cache.put(location,RDFA.triplestore);
		},

		/**
		 * Checks if the cache contains the information for a document, calling a callback if not. Then calls a callback
		 * if the document has any licensed objects
		 */
		callbackify : function(document,callbackHas,callbackNotCached)
		{
			const location = document.location.href;

			// For all pages, except for system ones like "about:blank", "about:config" and so on
			if (! location.match(/^about\:/i))
			{
				if (! ccffext.cache.contains(location) && "function" == typeof callbackNotCached)
				{
					callbackNotCached(document);
				}

				if (ccffext.cache.contains(location))
				{
					const objects = ccffext.objects.extract(document);

					if (0 < objects.length && "function" == typeof callbackHas)
					{
						callbackHas(document,objects);
					}
				}
			}
		},

		/**
		 * Returns a title for a licensed object.
		 *
		 * @param document The analysed document
		 * @param object The object
		 */
		getTitle : function(document,object)
		{
			for (let i = 0, pairs = ccffext.objects.getPairs(document,object); i < pairs.length; ++i)
			{
				if (pairs[i][0].uri == "http://purl.org/dc/terms/title")
				{
					return pairs[i][1];
				}
			}

			return document.location.href == object.uri
					? ccffext.l10n.get("object.title.current-page.label")
					: object.uri;
		},

		/**
		 * Returns a type for a licensed object
		 *
		 * @param document The analysed document
		 * @param object The object
		 */
		getType : function(document,object)
		{
			for (let i = 0, pairs = ccffext.objects.getPairs(document,object); i < pairs.length; ++i)
			{
				if (pairs[i][0].uri == "http://purl.org/dc/terms/type")
				{
					return pairs[i][1].uri.replace("http://purl.org/dc/dcmitype/","");
				}
			}

			return undefined;
		},

		/**
		 * Returns an author for a licensed object
		 *
		 * @param document The analysed document
		 * @param object The object
		 */
		getAuthor : function(document,object)
		{
			for (let i = 0, pairs = ccffext.objects.getPairs(document,object); i < pairs.length; ++i)
			{
				if (pairs[i][0].uri == "http://creativecommons.org/ns#attributionName")
				{
					return pairs[i][1];
				}
			}

			return undefined;
		},

		/**
		 * Returns an URI for an author for a licensed object
		 *
		 * @param document The analysed document
		 * @param object The object
		 */
		getAuthorUri : function(document,object)
		{
			for (let i = 0, pairs = ccffext.objects.getPairs(document,object); i < pairs.length; ++i)
			{
				if (pairs[i][0].uri == "http://creativecommons.org/ns#attributionURL")
				{
					return pairs[i][1];
				}
			}

			return undefined;
		},

		/**
		 * Returns a source for a licensed object.
		 *
		 * @param document The analysed document
		 * @param object The object
		 */
		getSource : function(document,object)
		{
			return object.uri;
		},

		/**
		 * Returns information about the license
		 *
		 * @param document The analysed document
		 * @param object The object
		 * @param window The context window
		 */
		getLicense : function(document,object,window,RDFA,XH)
		{
			var license =
			{
				name : undefined,
				uri : undefined,
				permissions : [],
				requirements : [],
				prohibitions: [],
				infoHtml : "",
				infoText : ""
			};

			for (let i = 0, pairs = ccffext.objects.getPairs(document,object); i < pairs.length; ++i)
			{
				if ((pairs[i][0].uri == "http://www.w3.org/1999/xhtml/vocab#copyright"
						|| pairs[i][0].uri == "http://www.w3.org/1999/xhtml/vocab#license"))
				{
					license.uri = pairs[i][1].uri;
					break;
				}
			}

			if ("undefined" != typeof license.uri &&
			    license.uri.indexOf("http://creativecommons.org/") == 0)
			{
			    // This is a Creative Commons license;
			    // make sure we're using the canonical URI
			    if (license.uri.lastIndexOf("/") < license.uri.length - 1) {
				// strip off the trailing bit
				license.uri = license.uri.slice(0, license.uri.lastIndexOf("/") + 1);
			    }

				var xhr = new window.XMLHttpRequest();
				let uri = "http://api.creativecommons.org/rest/dev/details?license-uri=" + license.uri;

				xhr.open("GET",uri,false);
				xhr.send();
				if (4 == xhr.readyState && 200 == xhr.status)
				{
					var parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
							.createInstance(Components.interfaces.nsIDOMParser);
					var doc = parser.parseFromString(xhr.responseText,"text/xml");

					license.name = doc.getElementsByTagName("license-name")[0].textContent;

					let perms = doc.getElementsByTagName("permits");
					for (let i = 0; i < perms.length / 2; ++i)
					{
						license.permissions.push(perms[i].getAttribute("rdf:resource")
								.replace("http://creativecommons.org/ns#",""));
					}

					let reqs = doc.getElementsByTagName("requires");
					for (let i = 0; i < reqs.length / 2; ++i)
					{
						license.requirements.push(reqs[i].getAttribute("rdf:resource")
								.replace("http://creativecommons.org/ns#",""));
					}

					let prohs = doc.getElementsByTagName("prohibits");
					for (let i = 0; i < prohs.length / 2; ++i)
					{
						license.prohibitions.push(prohs[i].getAttribute("rdf:resource")
								.replace("http://creativecommons.org/ns#",""));
					}

					license.infoHtml = xhr.responseText.match(/<html>(.+)<\/html>/)[0];
					license.infoText = doc.getElementsByTagName("html")[0].textContent;
				}
			}

			if ("undefined" == license.name)
			{
				license.name = license.uri;
			}

			return license;
		}
	},

	/**
	 * UI-related code
	 */
	ui :
	{
		/**
		 * The location bar icon-related code
		 */
		icon :
		{
			/**
			 * A XUL object represention the icon
			 */
			icon : undefined,

			/**
			 * A XUL object that should hold the icon
			 */
			container : undefined,

			/**
			 * Initializes the container for the icon and the icon itself
			 *
			 * @param document DOM document for the container and the icon
			 * @param callback A callback function that is called when clicking on the icon
			 */
			init : function(document,callback)
			{
				ccffext.ui.icon.icon = document.createElement("image");
				ccffext.ui.icon.container = document.getElementById("urlbar-icons");

				with (ccffext.ui.icon.icon)
				{
					setAttribute("id","ccffext-icon");
					addEventListener("click",callback,true);
				}
			},

			/**
			 * Shows the icon. The icon is put to the container using DOM
			 *
			 * @param document DOM document for the container and the icon
			 */
			show : function(document,objects)
			{
				with (ccffext.ui.icon)
				{
					container.setAttribute("ccffext-icon","true");
					container.appendChild(ccffext.ui.icon.icon);
					icon.setAttribute("tooltiptext",ccffext.l10n.get("icon.title.label",objects.length));
				}
			},

			/**
			 * Hides the icon. The icon is removed from the container using DOM
			 *
			 * @param document DOM document for the container and the icon
			 */
			hide : function()
			{
				if (ccffext.ui.icon.container.hasAttribute("ccffext-icon"))
				{
					ccffext.ui.icon.container.removeAttribute("ccffext-icon");
					ccffext.ui.icon.container.removeChild(ccffext.ui.icon.icon);
				}
			}
		}
	},

	/**
	 * Utility function that writes a message to the JavaScript console
	 *
	 * @param message A message
	 */
	log : function(message)
	{
		Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService)
				.logStringMessage(message);
    }
};