/**
 *
 * POIAdapter
 *  - Points of Interest Feature Layer Adapter
 *
 * Author:   John Grayson - Applications Prototype Lab - Esri
 * Created:  11/5/2019 - 0.01 -
 * Modified:
 *
 */
define([
  "dojo/_base/Color",
  "dojo/colors",
  "esri/core/Accessor",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/views/View",
  "esri/geometry/Extent",
  "esri/tasks/Locator",
  "esri/layers/FeatureLayer"
], function(Color, colors,
            Accessor, Evented,
            watchUtils, promiseUtils,
            View, Extent, Locator, FeatureLayer){


  /**
   *
   */
  const POISource = Accessor.createSubclass([Evented], {

    declaredClass: "POISource",

    LOCATOR_URL: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer",

    properties: {
      view: {
        type: View
      },
      _locator: {
        type: Locator
      },
      _searchGridSize: {
        type: Number,
        value: 1000
      },
      _searchedExtents: {
        type: Map
      }
    },

    constructor: function(){

      this._searchedExtents = new Map();

      watchUtils.whenDefinedOnce(this, "view", view => {

        this._locator = new Locator({
          url: this.LOCATOR_URL,
          outSpatialReference: view.spatialReference
        });

        let poi_search_handle = null;
        watchUtils.whenTrue(view, "stationary", () => {
          poi_search_handle && (!poi_search_handle.isFulfilled()) && poi_search_handle.cancel();
          poi_search_handle = this.findPOIs(view.extent);
        });
      });

    },

    /**
     *
     * @param extent
     * @returns {Promise}
     */
    findPOIs: function(extent){

      const extentJSON = extent.toJSON();
      const poiInfo = this._searchedExtents.get(extentJSON);
      if(poiInfo){

        this.emit("poi-features-created", { ...poiInfo, added: true });

      } else {

        return this._locator.addressToLocations({
          forStorage: false,
          searchExtent: extent,
          categories: ["POI"],
          outFields: ["Type", "ShortLabel", "Place_addr", "Phone", "URL"]
        }).then((addressCandidates) => {

          const poiInfo = {
            added: false,
            poiCount: addressCandidates.length,
            poiFeatures: addressCandidates.map(addressCandidate => {
              return {
                geometry: addressCandidate.location,
                attributes: addressCandidate.attributes
              };
            })
          };
          this._searchedExtents.set(extentJSON, poiInfo);

          this.emit("poi-features-created", poiInfo);
        });

      }
    }

  });

  /**
   *
   */
  const POIAdapter = Accessor.createSubclass([Evented], {

    declaredClass: "POIAdapter",

    properties: {
      _featuresIndex: {
        type: Array
      },
      layer: {
        type: FeatureLayer
      }
    },

    constructor: function(){

      this._featuresIndex = [];

      this.layer = new FeatureLayer({
        title: "Points of Interest",
        copyright: "Esri",
        fields: [
          {
            name: "ObjectID",
            type: "oid"
          },
          {
            name: "Type",
            type: "string"
          },
          {
            name: "ShortLabel",
            type: "string"
          },
          {
            name: "Place_addr",
            type: "string"
          },
          {
            name: "Phone",
            type: "string"
          },
          {
            name: "URL",
            type: "string"
          }
        ],
        objectIdField: "ObjectID",
        geometryType: "point",
        spatialReference: { wkid: 4326 },
        source: [],
        renderer: {
          type: "simple",
          symbol: {
            type: "simple-marker",
            style: "circle",
            color: Color.named.yellow.concat(0.3),
            size: 13.0,
            outline: {
              color: Color.named.gold.concat(0.9),
              width: 2.5
            }
          }
        },
        popupTemplate: {
          title: "{Type}",
          content: "{ShortLabel}<br>{Place_addr}<br>{Phone}<br>{URL}"
        }
      });
      this.layer.load().then(() => {

        this.layer.on("layerview-create", options => {
          if(!options.error){

            const poiSource = new POISource({ view: options.view });
            poiSource.on("poi-features-created", options => {
              if(!options.added){

                const poiFeatures = options.poiFeatures.reduce((list, feature) => {
                  if(!this._featuresIndex.includes(feature.attributes.ShortLabel)){
                    this._featuresIndex.push(feature.attributes.ShortLabel);
                    list.push(feature);
                  }
                  return list;
                }, []);
                this.layer.applyEdits({ addFeatures: poiFeatures });

              }
            });
          }
        });

      });

    }

  });

  POIAdapter.version = "0.01";

  return POIAdapter;
});

