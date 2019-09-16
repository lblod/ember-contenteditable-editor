import { analyse as scanContexts } from '@lblod/marawa/rdfa-context-scanner';

function triplesDefinedInResource( resourceUri ){
  let selector = `[resource='${resourceUri}']`;
  let domNodes = Array.from(this.rootNode.querySelectorAll(selector));
  let contexts = domNodes.reduce((acc, d) => {
    return [...acc, ...scanContexts(d)];
  }, []);

  let triples = contexts.reduce((acc, d) => {
    return [...acc, ...d.context];
  }, []);

  //Get unique values, this is O(n) right? :-)
  let triplesHash = triples.reduce( (acc, t) => {
    acc[JSON.stringify(sortedTripleObject(t))] = t;
    return acc;
  }, {});

  return Object.values(triplesHash);
}

function sortedTripleObject(triple){
  return Object.keys(triple).sort().reduce((acc, k) => {
    acc[k] = triple[k];
    return acc;
  } , {});
}

export { triplesDefinedInResource }
