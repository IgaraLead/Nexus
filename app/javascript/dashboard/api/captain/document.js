/* global axios */
import ApiClient from '../ApiClient';

class CaptainDocument extends ApiClient {
  constructor() {
    super('captain/documents', { accountScoped: true });
  }

  get({ page = 1, searchKey, assistantId, filter } = {}) {
    return axios.get(this.url, {
      params: {
        page,
        searchKey,
        assistant_id: assistantId,
        filter,
      },
    });
  }

  sync(id) {
    return axios.post(`${this.url}/${id}/sync`);
  }

  getStats({ assistantId } = {}) {
    return axios.get(`${this.url}/stats`, {
      params: { assistant_id: assistantId },
    });
  }
}

export default new CaptainDocument();
