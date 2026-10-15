# Word lists

`<language>.json` holds the words the sanitiser lets through: `booleans` pass as a whole cell, `headings` and `jobTitles` pass inside one. They are written by hand, never with a word that is also a common name.

`commonNames.json` is what a test checks them against: the 1,000 most frequent surnames of the [US Census 2010](https://www.census.gov/topics/population/genealogy/data/2010_surnames.html), and the given names [Wikidata](https://www.wikidata.org) items of given names with 10 or more sitelinks carry as a label in one of our languages (`de`, `en`, `es`, `fr`, `nl`, `mul`), lower case, without the item for the concept of a Christian name (Q2396897), whose labels are heading words such as Taufname. Both sources are public domain (CC0).
