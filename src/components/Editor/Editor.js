import PropTypes from 'prop-types';
import React from 'react';
import ImmutablePropTypes from 'react-immutable-proptypes';
import { connect } from 'react-redux';
import history from 'Routing/history';
import {
  loadEntry,
  createDraftFromEntry,
  createEmptyDraft,
  discardDraft,
  changeDraftField,
  changeDraftFieldValidation,
  persistEntry,
  deleteEntry,
} from 'Actions/entries';
import {
  updateUnpublishedEntryStatus,
  publishUnpublishedEntry,
  deleteUnpublishedEntry
} from 'Actions/editorialWorkflow';
import { deserializeValues } from 'Lib/serializeEntryValues';
import { addAsset } from 'Actions/media';
import { openMediaLibrary, removeInsertedMedia } from 'Actions/mediaLibrary';
import { selectEntry, getAsset } from 'Reducers';
import { selectFields } from 'Reducers/collections';
import { Loader } from 'UI';
import { EDITORIAL_WORKFLOW } from 'Constants/publishModes';
import EditorInterface from './EditorInterface';
import withWorkflow from './withWorkflow';

const navigateCollection = (collectionPath) => history.push(`/collections/${collectionPath}`);
const navigateToCollection = collectionName => navigateCollection(collectionName);
const navigateToNewEntry = collectionName => navigateCollection(`${collectionName}/new`);
const navigateToCurrentEntry = (collectionName, slug) => navigateCollection(`${collectionName}/entries/${slug}`);

class Editor extends React.Component {
  static propTypes = {
    addAsset: PropTypes.func.isRequired,
    boundGetAsset: PropTypes.func.isRequired,
    changeDraftField: PropTypes.func.isRequired,
    changeDraftFieldValidation: PropTypes.func.isRequired,
    collection: ImmutablePropTypes.map.isRequired,
    createDraftFromEntry: PropTypes.func.isRequired,
    createEmptyDraft: PropTypes.func.isRequired,
    discardDraft: PropTypes.func.isRequired,
    entry: ImmutablePropTypes.map,
    mediaPaths: ImmutablePropTypes.map.isRequired,
    entryDraft: ImmutablePropTypes.map.isRequired,
    loadEntry: PropTypes.func.isRequired,
    persistEntry: PropTypes.func.isRequired,
    deleteEntry: PropTypes.func.isRequired,
    showDelete: PropTypes.bool.isRequired,
    openMediaLibrary: PropTypes.func.isRequired,
    removeInsertedMedia: PropTypes.func.isRequired,
    closeEntry: PropTypes.func.isRequired,
    fields: ImmutablePropTypes.list.isRequired,
    slug: PropTypes.string,
    newEntry: PropTypes.bool.isRequired,
    displayUrl: PropTypes.string,
    hasWorkflow: PropTypes.bool,
    unpublishedEntry: PropTypes.bool,
  };

  componentDidMount() {
    const { entry, newEntry, collection, slug, loadEntry, createEmptyDraft } = this.props;
    if (newEntry) {
      createEmptyDraft(collection);
    } else {
      loadEntry(collection, slug);
    }

    const leaveMessage = 'Are you sure you want to leave this page?';

    this.exitBlocker = (event) => {
      if (this.props.entryDraft.get('hasChanged')) {
        // This message is ignored in most browsers, but its presence
        // triggers the confirmation dialog
        event.returnValue = leaveMessage;
        return leaveMessage;
      }
    };
    window.addEventListener('beforeunload', this.exitBlocker);

    const navigationBlocker = () => {
      if (this.props.entryDraft.get('hasChanged')) {
        return leaveMessage;
      }
    };
    const unblock = history.block(navigationBlocker);

    /**
     * This will run as soon as the location actually changes, unless creating
     * a new post. The confirmation above will run first.
     */
    this.unlisten = history.listen(location => {
      if (location.pathname !== `/collections/${collection.get('name')}/new`) {
        unblock();
        this.unlisten();
      }
    });
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.entry === nextProps.entry) return;
    const { entry, newEntry, fields, collection } = nextProps;

    if (entry && !entry.get('isFetching') && !entry.get('error')) {

      /**
       * Deserialize entry values for widgets with registered serializers before
       * creating the entry draft.
       */
      const values = deserializeValues(entry.get('data'), fields);
      const deserializedEntry = entry.set('data', values);
      this.createDraft(deserializedEntry);
    } else if (newEntry) {
      this.props.createEmptyDraft(collection);
    }
  }

  componentWillUnmount() {
    this.props.discardDraft();
    window.removeEventListener('beforeunload', this.exitBlocker);
  }

  createDraft = (entry) => {
    if (entry) this.props.createDraftFromEntry(entry);
  };

  handlePersistEntry = async (opts = {}) => {
    const { createNew = false } = opts;
    const { persistEntry, collection } = this.props;

    await persistEntry(collection)

    if (createNew) {
      navigateToNewEntry(collection.get('name'));
    }
  };

  handleDeleteEntry = () => {
    const { newEntry, collection, deleteEntry, entry } = this.props;
    if (!window.confirm('Are you sure you want to delete this entry?')) {
      return;
    }
    if (newEntry) {
      return navigateToCollection(collection.get('name'));
    }

    const slug = entry.get('slug');
    setTimeout(async () => {
      await deleteEntry(collection, slug);
      return navigateToCollection(collection.get('name'));
    }, 0);
  };

  handleDeleteUnpublishedChanges = async () => {
    const { collection, slug, deleteUnpublishedEntry, entry } = this.props;
    if (!window.confirm('All unpublished changes to this entry will be deleted. Are you sure?')) {
      return;
    }
    await this.props.deleteUnpublishedEntry(collection, entry.get('slug'));

    /**
     * Nasty hack to force the editor to reload - we need to do this through
     * redux instead.
     */
    window.location.reload();
  };

  render() {
    const {
      entry,
      entryDraft,
      fields,
      mediaPaths,
      boundGetAsset,
      collection,
      changeDraftField,
      changeDraftFieldValidation,
      openMediaLibrary,
      addAsset,
      removeInsertedMedia,
      user,
      hasChanged,
      displayUrl,
      hasWorkflow,
      unpublishedEntry,
      newEntry,
    } = this.props;

    if (entry && entry.get('error')) {
      return <div><h3>{ entry.get('error') }</h3></div>;
    } else if (entryDraft == null
      || entryDraft.get('entry') === undefined
      || (entry && entry.get('isFetching'))) {
      return <Loader active>Loading entry...</Loader>;
    }

    return (
      <EditorInterface
        entry={entryDraft.get('entry')}
        getAsset={boundGetAsset}
        collection={collection}
        fields={fields}
        fieldsMetaData={entryDraft.get('fieldsMetaData')}
        fieldsErrors={entryDraft.get('fieldsErrors')}
        mediaPaths={mediaPaths}
        onChange={changeDraftField}
        onValidate={changeDraftFieldValidation}
        onOpenMediaLibrary={openMediaLibrary}
        onAddAsset={addAsset}
        onRemoveInsertedMedia={removeInsertedMedia}
        onPersist={this.handlePersistEntry}
        onDelete={this.handleDeleteEntry}
        onDeleteUnpublishedChanges={this.handleDeleteUnpublishedChanges}
        showDelete={this.props.showDelete}
        enableSave={entryDraft.get('hasChanged')}
        user={user}
        hasChanged={hasChanged}
        displayUrl={displayUrl}
        hasWorkflow={hasWorkflow}
        hasUnpublishedChanges={unpublishedEntry}
        isNewEntry={newEntry}
      />
    );
  }
}

function mapStateToProps(state, ownProps) {
  const { collections, entryDraft, mediaLibrary, auth, config } = state;
  const slug = ownProps.match.params.slug;
  const collection = collections.get(ownProps.match.params.name);
  const newEntry = ownProps.newRecord === true;
  const fields = selectFields(collection, slug);
  const entry = newEntry ? null : selectEntry(state, collection.get('name'), slug);
  const boundGetAsset = getAsset.bind(null, state);
  const mediaPaths = mediaLibrary.get('controlMedia');
  const user = auth && auth.get('user');
  const hasChanged = entryDraft.get('hasChanged');
  const displayUrl = config.get('display_url');
  const hasWorkflow = config.get('publish_mode') === EDITORIAL_WORKFLOW;
  return {
    collection,
    collections,
    newEntry,
    entryDraft,
    mediaPaths,
    boundGetAsset,
    fields,
    slug,
    entry,
    user,
    hasChanged,
    displayUrl,
    hasWorkflow,
  };
}

export default connect(
  mapStateToProps,
  {
    changeDraftField,
    changeDraftFieldValidation,
    openMediaLibrary,
    removeInsertedMedia,
    addAsset,
    loadEntry,
    createDraftFromEntry,
    createEmptyDraft,
    discardDraft,
    persistEntry,
    deleteEntry,
    updateUnpublishedEntryStatus,
    publishUnpublishedEntry,
    deleteUnpublishedEntry,
  }
)(withWorkflow(Editor));
